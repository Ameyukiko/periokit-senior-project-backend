import { env } from "../../lib/env";
import type {
  CreateExportRequest,
  PreviewExportRequest,
} from "./exports.contract";
import { loadXrayAssetsForRender } from "./exports.assets";
import { ExportError, throwIfAborted } from "./exports.errors";
import { generateExport } from "./exports.generator";
import {
  buildExportRenderModel,
  buildExportSourceModel,
  EXPORT_RENDERER_PROTOCOL_VERSION,
} from "./exports.render-model";
import {
  createRenderCacheKey,
  ExportRenderCache,
  type RenderQuality,
} from "./exports.render-cache";
import { ExportTimings } from "./exports.metrics";
import { renderReport } from "./exports.renderer";
import { generateExportWithSharedView, renderWithSharedView } from "./exports.shared-renderer";
import {
  assertSectionsAvailable,
  getSectionAvailability,
  loadExportSnapshot,
} from "./exports.snapshot";

const exportRenderCache = new ExportRenderCache(
  env.EXPORT_RENDER_CACHE_TTL_MS,
  env.EXPORT_RENDER_CACHE_MAX_BYTES
);

const currentRendererVersion = () =>
  env.EXPORT_RENDERER_URL ? EXPORT_RENDERER_PROTOCOL_VERSION : "legacy";

export const getVisitExportSource = async (
  visitId: string,
  userId: string,
  signal: AbortSignal,
  timings = new ExportTimings()
) => {
  const snapshot = await timings.measure("snapshot", () =>
    loadExportSnapshot(visitId, userId, signal)
  );
  const availability = getSectionAvailability(snapshot);
  const assets = availability.images.available
    ? await timings.measure("assets", () =>
        loadXrayAssetsForRender(snapshot, false, signal)
      )
    : new Map<string, string>();
  throwIfAborted(signal);
  return buildExportSourceModel(
    snapshot,
    assets,
    currentRendererVersion(),
    availability
  );
};

const renderVisitReport = async (
  snapshot: Awaited<ReturnType<typeof loadExportSnapshot>>,
  request: PreviewExportRequest,
  assets: Awaited<ReturnType<typeof loadXrayAssetsForRender>>,
  signal: AbortSignal,
  quality: RenderQuality
) => {
  const generatedAt = new Date().toISOString();
  if (!env.EXPORT_RENDERER_URL) {
    return {
      report: renderReport(snapshot, request, assets, generatedAt),
      rendererVersion: "legacy",
    };
  }

  const model = buildExportRenderModel(snapshot, request, assets, generatedAt);
  const report = await renderWithSharedView(
    model,
    env.EXPORT_RENDERER_URL,
    env.EXPORT_RENDERER_READY_TIMEOUT_MS,
    signal,
    quality
  );
  return { report, rendererVersion: EXPORT_RENDERER_PROTOCOL_VERSION };
};

const renderVisitReportCached = async (
  visitId: string,
  userId: string,
  snapshot: Awaited<ReturnType<typeof loadExportSnapshot>>,
  request: PreviewExportRequest,
  signal: AbortSignal,
  quality: RenderQuality,
  timings: ExportTimings
) => {
  const rendererVersion = currentRendererVersion();
  // The legacy renderer emits identical HTML for preview and export. Sharing
  // that cache entry avoids downloading and resizing the same images twice.
  const cacheQuality = env.EXPORT_RENDERER_URL ? quality : "preview";
  const cacheKey = createRenderCacheKey({
    visitId,
    userId,
    snapshotVersion: snapshot.snapshotVersion,
    rendererVersion,
    quality: cacheQuality,
    request,
  });
  const cached = exportRenderCache.get(cacheKey);
  if (cached) return { report: cached, rendererVersion };

  const assets = request.sections.includes("images")
    ? await timings.measure("assets", () =>
        loadXrayAssetsForRender(snapshot, request.grayscale, signal)
      )
    : new Map<string, string>();
  const rendered = await timings.measure("render", () =>
    renderVisitReport(snapshot, request, assets, signal, quality)
  );
  throwIfAborted(signal);
  exportRenderCache.set(cacheKey, rendered.report);
  return rendered;
};

export const previewVisitExport = async (
  visitId: string,
  userId: string,
  request: PreviewExportRequest,
  signal: AbortSignal,
  timings = new ExportTimings()
) => {
  const snapshot = await timings.measure("snapshot", () =>
    loadExportSnapshot(visitId, userId, signal)
  );
  assertSectionsAvailable(snapshot, request.sections);
  const { report, rendererVersion } = await renderVisitReportCached(
    visitId,
    userId,
    snapshot,
    request,
    signal,
    "preview",
    timings
  );
  throwIfAborted(signal);
  return {
    snapshotVersion: snapshot.snapshotVersion,
    rendererVersion,
    availability: getSectionAvailability(snapshot),
    pageCount: report.pages.length,
    pages: report.pages,
    warnings: report.warnings,
  };
};

export const createVisitExport = async (
  visitId: string,
  userId: string,
  request: CreateExportRequest,
  signal: AbortSignal,
  timings = new ExportTimings()
) => {
  const snapshot = await timings.measure("snapshot", () =>
    loadExportSnapshot(visitId, userId, signal)
  );
  if (snapshot.snapshotVersion !== request.expectedSnapshotVersion) {
    throw new ExportError(
      409,
      "EXPORT_SOURCE_CHANGED",
      "The saved visit changed after the preview was generated",
      { currentSnapshotVersion: snapshot.snapshotVersion }
    );
  }
  if (
    env.EXPORT_RENDERER_URL &&
    request.expectedRendererVersion !== EXPORT_RENDERER_PROTOCOL_VERSION
  ) {
    throw new ExportError(
      409,
      "EXPORT_RENDERER_CHANGED",
      "The report renderer changed after the preview was generated",
      { currentRendererVersion: EXPORT_RENDERER_PROTOCOL_VERSION }
    );
  }
  assertSectionsAvailable(snapshot, request.sections);

  const rendererUrl = env.EXPORT_RENDERER_URL;
  if (request.format !== "excel" && rendererUrl) {
    const assets = request.sections.includes("images")
      ? await timings.measure("assets", () =>
          loadXrayAssetsForRender(snapshot, request.grayscale, signal)
        )
      : new Map<string, string>();
    const model = buildExportRenderModel(snapshot, request, assets);
    return timings.measure("generate", () =>
      generateExportWithSharedView(
        model,
        request,
        rendererUrl,
        env.EXPORT_RENDERER_READY_TIMEOUT_MS,
        signal
      )
    );
  }

  const report = request.format === "excel"
    ? { pages: [], warnings: [] }
    : (await renderVisitReportCached(
        visitId,
        userId,
        snapshot,
        request,
        signal,
        "export",
        timings
      )).report;
  return timings.measure("generate", () =>
    generateExport(snapshot, request, report.pages, signal)
  );
};
