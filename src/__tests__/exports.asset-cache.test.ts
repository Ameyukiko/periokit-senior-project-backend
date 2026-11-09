import { describe, expect, it, vi } from "vitest";
import {
  createAssetCacheKey,
  ExportAssetCache,
} from "../modules/exports/exports.asset-cache";

describe("ExportAssetCache", () => {
  it("coalesces concurrent processing and reuses the completed result", async () => {
    const cache = new ExportAssetCache(1_000, 1_024);
    let release!: (value: string) => void;
    const factory = vi.fn(
      () => new Promise<string>((resolve) => { release = resolve; })
    );
    const signal = new AbortController().signal;

    const first = cache.getOrCreate("asset", factory, signal);
    const second = cache.getOrCreate("asset", factory, signal);
    expect(factory).toHaveBeenCalledTimes(1);

    release("rendered");
    await expect(Promise.all([first, second])).resolves.toEqual(["rendered", "rendered"]);
    await expect(cache.getOrCreate("asset", factory, signal)).resolves.toBe("rendered");
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("expires entries and evicts least-recently-used values within the byte limit", async () => {
    const cache = new ExportAssetCache(10, 6);
    const signal = new AbortController().signal;
    await cache.getOrCreate("first", async () => "111", signal);
    await cache.getOrCreate("second", async () => "222", signal);
    expect(cache.get("first", 0)).toBe("111");

    await cache.getOrCreate("third", async () => "333", signal);
    expect(cache.get("second", 0)).toBeUndefined();
    expect(cache.get("first", 0)).toBe("111");
    expect(cache.get("third", 0)).toBe("333");
    expect(cache.get("first", Date.now() + 20)).toBeUndefined();
  });

  it("lets one subscriber cancel without cancelling shared processing", async () => {
    const cache = new ExportAssetCache(1_000, 1_024);
    let release!: (value: string) => void;
    const factory = vi.fn(
      () => new Promise<string>((resolve) => { release = resolve; })
    );
    const cancelled = new AbortController();
    const active = new AbortController();
    const first = cache.getOrCreate("asset", factory, cancelled.signal);
    const second = cache.getOrCreate("asset", factory, active.signal);

    cancelled.abort();
    await expect(first).rejects.toMatchObject({ code: "EXPORT_CANCELLED" });
    release("rendered");
    await expect(second).resolves.toBe("rendered");
  });

  it("keys transformed variants without exposing storage paths", () => {
    const base = {
      assetId: "asset-id",
      storagePath: "private/patient/image.png",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const color = createAssetCacheKey({ ...base, grayscale: false });
    const grayscale = createAssetCacheKey({ ...base, grayscale: true });

    expect(color).not.toBe(grayscale);
    expect(color).not.toContain(base.storagePath);
  });
});

