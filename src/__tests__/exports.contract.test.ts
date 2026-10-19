import { describe, expect, it } from "vitest";
import {
  createExportRequestSchema,
  previewExportRequestSchema,
} from "../modules/exports/exports.contract";
import { contentDisposition } from "../modules/exports/exports.generator";

describe("export request contract", () => {
  it("sanitizes unsafe filename characters", () => {
    const parsed = previewExportRequestSchema.parse({
      format: "pdf",
      sections: ["chart"],
      baseFilename: "  report:/patient*?.pdf  ",
    });

    expect(parsed.baseFilename).not.toMatch(/[<>:"/\\|?*]/);
    expect(parsed.baseFilename).toBe("report--patient--.pdf");
  });

  it("requires DPI only for PNG", () => {
    expect(
      previewExportRequestSchema.safeParse({ format: "png", sections: ["chart"] }).success
    ).toBe(false);
    expect(
      previewExportRequestSchema.safeParse({
        format: "png",
        sections: ["chart"],
        pngDpi: 300,
      }).success
    ).toBe(true);
    expect(
      previewExportRequestSchema.safeParse({
        format: "pdf",
        sections: ["chart"],
        pngDpi: 96,
      }).success
    ).toBe(false);
  });

  it("rejects duplicate sections and invalid snapshot versions", () => {
    expect(
      previewExportRequestSchema.safeParse({
        format: "pdf",
        sections: ["chart", "chart"],
      }).success
    ).toBe(false);
    expect(
      createExportRequestSchema.safeParse({
        format: "pdf",
        sections: ["chart"],
        expectedSnapshotVersion: "stale",
      }).success
    ).toBe(false);
  });

  it("validates the optional renderer compatibility version", () => {
    const base = {
      format: "pdf" as const,
      sections: ["chart"],
      expectedSnapshotVersion: "a".repeat(43),
    };
    expect(
      createExportRequestSchema.safeParse({ ...base, expectedRendererVersion: "1.0" }).success
    ).toBe(true);
    expect(
      createExportRequestSchema.safeParse({ ...base, expectedRendererVersion: "latest" }).success
    ).toBe(false);
  });

  it("creates safe ASCII and RFC 5987 download names", () => {
    const header = contentDisposition("รายงานผู้ป่วย.pdf");
    expect(header).toContain('filename="_____________.pdf"');
    expect(header).toContain("filename*=UTF-8''");
    expect(header).toContain("%E0%B8");
  });
});
