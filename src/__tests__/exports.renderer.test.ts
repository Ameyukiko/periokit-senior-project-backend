import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/env", () => ({
  env: {
    EXPORT_MAX_PAGES: 6,
    EXPORT_MAX_ASSETS: 30,
    EXPORT_MAX_SOURCE_BYTES: 150 * 1024 * 1024,
  },
}));
import { renderReport } from "../modules/exports/exports.renderer";
import {
  computeSnapshotVersion,
  getSectionAvailability,
} from "../modules/exports/exports.snapshot";
import type { PreviewExportRequest } from "../modules/exports/exports.contract";
import { exportSnapshotFixture } from "./exports.fixture";

describe("export renderer", () => {
  it("renders patient details on every selected section and applies orientation", () => {
    const report = renderReport(
      exportSnapshotFixture(),
      {
        format: "pdf",
        sections: ["chart", "diagnosis", "notes"],
        paperSize: "a4",
        orientations: {},
        grayscale: false,
        baseFilename: "report",
      },
      new Map(),
      "2026-10-19T07:00:00.000Z"
    );

    expect(report.pages.map((page) => page.section)).toEqual([
      "chart",
      "diagnosis",
      "notes",
    ]);
    expect(report.pages[0]).toMatchObject({ widthMm: 210, heightMm: 297 });
    expect(report.pages[1]).toMatchObject({ widthMm: 210, heightMm: 297 });
    expect(report.pages[2].html).toContain("Page 3 of 3");
    for (const page of report.pages) {
      expect(page.html).toContain("HN 00123");
      expect(page.html).toContain("Visit 2026-10-19");
    }
  });

  it("escapes all database text and renders deterministically", () => {
    const snapshot = exportSnapshotFixture();
    snapshot.patient.firstName = '<script>alert("x")</script>';
    snapshot.visit.clinicalNote = '<img src=x onerror="alert(1)">';
    const input: PreviewExportRequest = {
      format: "pdf",
      sections: ["notes"],
      paperSize: "letter",
      orientations: {},
      grayscale: true,
      baseFilename: "report",
    };

    const first = renderReport(snapshot, input, new Map(), "2026-10-19T07:00:00.000Z");
    const second = renderReport(snapshot, input, new Map(), "2026-10-19T07:00:00.000Z");
    const html = first.pages.map((page) => page.html).join("\n");

    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(createHash("sha256").update(html).digest("hex")).toBe(
      createHash("sha256").update(second.pages.map((page) => page.html).join("\n")).digest("hex")
    );
  });

  it("reports unavailable sections with a reason", () => {
    const availability = getSectionAvailability(exportSnapshotFixture());
    expect(availability.chart.available).toBe(true);
    expect(availability.images.available).toBe(false);
    expect(availability.images.reason).toBeTruthy();
    expect(availability.imageNotes.available).toBe(true);
  });

  it("changes the snapshot version when saved clinical data changes", () => {
    const first = exportSnapshotFixture();
    const second = exportSnapshotFixture();
    second.chart!.teeth[0].sites[0].pdMm = 7;
    const { snapshotVersion: _firstVersion, ...firstData } = first;
    const { snapshotVersion: _secondVersion, ...secondData } = second;

    expect(computeSnapshotVersion(firstData)).toHaveLength(43);
    expect(computeSnapshotVersion(firstData)).not.toBe(computeSnapshotVersion(secondData));
  });
});
