import { createHash } from "node:crypto";
import type { PreviewExportRequest } from "./exports.contract";
import type { RenderedReport } from "./exports.renderer";

export type RenderQuality = "preview" | "export";

type CacheEntry = {
  report: RenderedReport;
  expiresAt: number;
  bytes: number;
};

export class ExportRenderCache {
  private readonly entries = new Map<string, CacheEntry>();
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
    // Refresh insertion order for LRU eviction without extending the TTL.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.report;
  }

  set(key: string, report: RenderedReport, now = Date.now()) {
    const bytes = report.pages.reduce(
      (sum, page) => sum + Buffer.byteLength(page.html, "utf8"),
      Buffer.byteLength(JSON.stringify(report.warnings), "utf8")
    );
    if (bytes > this.maxBytes) return;

    const previous = this.entries.get(key);
    if (previous) this.remove(key, previous);
    this.pruneExpired(now);
    while (this.totalBytes + bytes > this.maxBytes && this.entries.size > 0) {
      const oldest = this.entries.entries().next().value as [string, CacheEntry] | undefined;
      if (!oldest) break;
      this.remove(oldest[0], oldest[1]);
    }
    this.entries.set(key, { report, expiresAt: now + this.ttlMs, bytes });
    this.totalBytes += bytes;
  }

  clear() {
    this.entries.clear();
    this.totalBytes = 0;
  }

  get stats() {
    return { entries: this.entries.size, bytes: this.totalBytes };
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

export const createRenderCacheKey = (input: {
  userId: string;
  visitId: string;
  snapshotVersion: string;
  rendererVersion: string;
  quality: RenderQuality;
  request: PreviewExportRequest;
}) => {
  const visualOptions = {
    format: input.request.format,
    sections: input.request.sections,
    paperSize: input.request.paperSize,
    orientations: input.request.orientations,
    grayscale: input.request.grayscale,
  };
  return createHash("sha256")
    .update(JSON.stringify({
      userId: input.userId,
      visitId: input.visitId,
      snapshotVersion: input.snapshotVersion,
      rendererVersion: input.rendererVersion,
      quality: input.quality,
      visualOptions,
    }))
    .digest("base64url");
};
