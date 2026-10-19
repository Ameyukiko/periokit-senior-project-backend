import type {
  CreateExportRequest,
  PreviewExportRequest,
} from "./exports.contract";
import { loadXrayAssetsForRender } from "./exports.assets";
import { ExportError, throwIfAborted } from "./exports.errors";
import { generateExport } from "./exports.generator";
import { renderReport } from "./exports.renderer";
import {
  assertSectionsAvailable,
  getSectionAvailability,
  loadExportSnapshot,
} from "./exports.snapshot";

export const previewVisitExport = async (
  visitId: string,
  userId: string,
  request: PreviewExportRequest,
  signal: AbortSignal
) => {
  const snapshot = await loadExportSnapshot(visitId, userId, signal);
  assertSectionsAvailable(snapshot, request.sections);
  const assets = request.sections.includes("images")
    ? await loadXrayAssetsForRender(snapshot, request.grayscale, signal)
    : new Map<string, string>();
  const report = renderReport(snapshot, request, assets);
  throwIfAborted(signal);
  return {
    snapshotVersion: snapshot.snapshotVersion,
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
  signal: AbortSignal
) => {
  const snapshot = await loadExportSnapshot(visitId, userId, signal);
  if (snapshot.snapshotVersion !== request.expectedSnapshotVersion) {
    throw new ExportError(
      409,
      "EXPORT_SOURCE_CHANGED",
      "The saved visit changed after the preview was generated",
      { currentSnapshotVersion: snapshot.snapshotVersion }
    );
  }
  assertSectionsAvailable(snapshot, request.sections);

  const assets =
    request.format !== "excel" && request.sections.includes("images")
      ? await loadXrayAssetsForRender(snapshot, request.grayscale, signal)
      : new Map<string, string>();
  const report = renderReport(snapshot, request, assets);
  return generateExport(snapshot, request, report.pages, signal);
};
