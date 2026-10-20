import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/env", () => ({ env: { EXPORT_MAX_PAGES: 6 } }));
import type { CreateExportRequest } from "../modules/exports/exports.contract";
import { generateExport } from "../modules/exports/exports.generator";
import { renderReport } from "../modules/exports/exports.renderer";
import { exportSnapshotFixture } from "./exports.fixture";

describe("Chromium export smoke tests", () => {
  it("generates a mixed-orientation PDF with one page per section", async () => {
    const snapshot = exportSnapshotFixture();
    const request: CreateExportRequest = {
      format: "pdf",
      sections: ["chart", "diagnosis"],
      paperSize: "a4",
      orientations: {},
      grayscale: false,
      baseFilename: "report",
      expectedSnapshotVersion: snapshot.snapshotVersion,
    };
    const report = renderReport(snapshot, request, new Map(), "2026-10-19T07:00:00.000Z");
    const generated = await generateExport(
      snapshot,
      request,
      report.pages,
      new AbortController().signal
    );
    const pdf = await PDFDocument.load(generated.body);

    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getPage(0).getWidth()).toBeLessThan(pdf.getPage(0).getHeight());
    expect(pdf.getPage(1).getWidth()).toBeLessThan(pdf.getPage(1).getHeight());
    expect(generated.contentType).toBe("application/pdf");
  }, 30000);

  it("generates a direct PNG at the requested physical DPI", async () => {
    const snapshot = exportSnapshotFixture();
    const request: CreateExportRequest = {
      format: "png",
      sections: ["notes"],
      paperSize: "a4",
      orientations: {},
      grayscale: false,
      pngDpi: 150,
      baseFilename: "report",
      expectedSnapshotVersion: snapshot.snapshotVersion,
    };
    const report = renderReport(snapshot, request, new Map(), "2026-10-19T07:00:00.000Z");
    const generated = await generateExport(
      snapshot,
      request,
      report.pages,
      new AbortController().signal
    );
    const metadata = await sharp(generated.body).metadata();

    expect(generated.filename).toBe("report.png");
    expect(generated.contentType).toBe("image/png");
    expect(metadata.width).toBe(Math.round((210 / 25.4) * 150));
    expect(metadata.height).toBe(Math.round((297 / 25.4) * 150));
  }, 30000);

  it("packages multiple PNG pages with deterministic filenames", async () => {
    const snapshot = exportSnapshotFixture();
    const request: CreateExportRequest = {
      format: "png",
      includeImageNotes: true,
      sections: ["chart", "notes", "imageNotes"],
      paperSize: "a4",
      orientations: {},
      grayscale: true,
      pngDpi: 96,
      baseFilename: "report",
      expectedSnapshotVersion: snapshot.snapshotVersion,
    };
    const report = renderReport(snapshot, request, new Map(), "2026-10-19T07:00:00.000Z");
    const generated = await generateExport(
      snapshot,
      request,
      report.pages,
      new AbortController().signal
    );
    const zip = await JSZip.loadAsync(generated.body);

    expect(generated.filename).toBe("report.zip");
    expect(Object.keys(zip.files)).toEqual([
      "report-01-chart.png",
      "report-02-notes.png",
    ]);
  }, 30000);
});
