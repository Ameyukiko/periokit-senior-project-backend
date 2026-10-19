import { describe, expect, it } from "vitest";
import {
  createRenderCacheKey,
  ExportRenderCache,
} from "../modules/exports/exports.render-cache";
import type { PreviewExportRequest } from "../modules/exports/exports.contract";
import type { RenderedReport } from "../modules/exports/exports.renderer";

const request = (overrides: Partial<PreviewExportRequest> = {}): PreviewExportRequest => ({
  format: "pdf",
  sections: ["chart"],
  paperSize: "a4",
  orientations: { chart: "portrait" },
  grayscale: false,
  baseFilename: "report",
  ...overrides,
});

const report = (html: string): RenderedReport => ({
  pages: [{
    id: "1-chart",
    section: "chart",
    title: "Chart",
    pageNumber: 1,
    widthMm: 210,
    heightMm: 297,
    orientation: "portrait",
    html,
  }],
  warnings: [],
});

describe("ExportRenderCache", () => {
  it("expires entries and keeps its byte accounting bounded", () => {
    const cache = new ExportRenderCache(1000, 1024);
    cache.set("a", report("first"), 100);
    expect(cache.get("a", 1099)).toBeDefined();
    expect(cache.get("a", 1100)).toBeUndefined();
    expect(cache.stats).toEqual({ entries: 0, bytes: 0 });
  });

  it("evicts the least recently used report before exceeding the byte limit", () => {
    const sampleBytes = Buffer.byteLength("first", "utf8") + Buffer.byteLength("[]", "utf8");
    const cache = new ExportRenderCache(1000, sampleBytes * 2);
    cache.set("a", report("first"), 100);
    cache.set("b", report("first"), 100);
    cache.get("a", 101);
    cache.set("c", report("first"), 102);
    expect(cache.get("b", 103)).toBeUndefined();
    expect(cache.get("a", 103)).toBeDefined();
    expect(cache.get("c", 103)).toBeDefined();
  });
});

describe("createRenderCacheKey", () => {
  const key = (overrides: Partial<Parameters<typeof createRenderCacheKey>[0]> = {}) =>
    createRenderCacheKey({
      userId: "user-a",
      visitId: "visit-a",
      snapshotVersion: "snapshot-a",
      rendererVersion: "1.0",
      quality: "preview",
      request: request(),
      ...overrides,
    });

  it("ignores filename and PNG DPI because they do not change rendered pixels", () => {
    expect(key()).toBe(key({ request: request({ baseFilename: "other", pngDpi: 300 }) }));
  });

  it("isolates cache entries by user, visit, snapshot, quality, and visual options", () => {
    const baseline = key();
    expect(key({ userId: "user-b" })).not.toBe(baseline);
    expect(key({ visitId: "visit-b" })).not.toBe(baseline);
    expect(key({ snapshotVersion: "snapshot-b" })).not.toBe(baseline);
    expect(key({ quality: "export" })).not.toBe(baseline);
    expect(key({ request: request({ grayscale: true }) })).not.toBe(baseline);
  });
});
