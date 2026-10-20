import { createHash } from "node:crypto";
import { ExportError } from "./exports.errors";

type CacheEntry = {
  value: string;
  bytes: number;
  expiresAt: number;
};

export class ExportAssetCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<string>>();
  private totalBytes = 0;

  constructor(
    private readonly ttlMs: number,
    private readonly maxBytes: number
  ) {}

  get(key: string, now = Date.now()) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) {
      this.remove(key, entry);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  async getOrCreate(
    key: string,
    factory: () => Promise<string>,
    signal: AbortSignal
  ): Promise<string> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;

    let pending = this.inFlight.get(key);
    if (!pending) {
      pending = factory().then((value) => {
        this.set(key, value);
        return value;
      });
      this.inFlight.set(key, pending);
      void pending.finally(() => this.inFlight.delete(key)).catch(() => undefined);
    }

    if (signal.aborted) {
      throw new ExportError(499, "EXPORT_CANCELLED", "Export was cancelled");
    }
    return new Promise<string>((resolve, reject) => {
      const onAbort = () => {
        reject(new ExportError(499, "EXPORT_CANCELLED", "Export was cancelled"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      pending!.then(
        (value) => {
          signal.removeEventListener("abort", onAbort);
          resolve(value);
        },
        (error) => {
          signal.removeEventListener("abort", onAbort);
          reject(error);
        }
      );
    });
  }

  clear() {
    this.entries.clear();
    this.inFlight.clear();
    this.totalBytes = 0;
  }

  get stats() {
    return { entries: this.entries.size, bytes: this.totalBytes, inFlight: this.inFlight.size };
  }

  private set(key: string, value: string, now = Date.now()) {
    const bytes = Buffer.byteLength(value, "utf8");
    if (bytes > this.maxBytes) return;
    const previous = this.entries.get(key);
    if (previous) this.remove(key, previous);
    this.pruneExpired(now);
    while (this.totalBytes + bytes > this.maxBytes && this.entries.size > 0) {
      const oldest = this.entries.entries().next().value as [string, CacheEntry] | undefined;
      if (!oldest) break;
      this.remove(oldest[0], oldest[1]);
    }
    this.entries.set(key, { value, bytes, expiresAt: now + this.ttlMs });
    this.totalBytes += bytes;
  }

  private pruneExpired(now: number) {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.remove(key, entry);
    }
  }

  private remove(key: string, entry: CacheEntry) {
    if (!this.entries.delete(key)) return;
    this.totalBytes -= entry.bytes;
  }
}

export const createAssetCacheKey = (input: {
  assetId: string;
  storagePath: string;
  updatedAt: string;
  grayscale: boolean;
}) => createHash("sha256").update(JSON.stringify({ ...input, transformVersion: 1 })).digest("base64url");
