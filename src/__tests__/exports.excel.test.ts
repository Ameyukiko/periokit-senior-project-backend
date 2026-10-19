import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { generateExport } from "../modules/exports/exports.generator";
import { exportSnapshotFixture } from "./exports.fixture";

describe("Excel export", () => {
  it("creates the required sheets and preserves clinical value types", async () => {
    const generated = await generateExport(
      exportSnapshotFixture(),
      {
        format: "excel",
        sections: ["chart", "diagnosis"],
        paperSize: "a4",
        orientations: {},
        grayscale: false,
        baseFilename: "patient-report",
        expectedSnapshotVersion: "a".repeat(43),
      },
      [],
      new AbortController().signal
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(generated.body as any);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Chart",
      "Sites",
      "Diagnosis",
    ]);
    expect(workbook.getWorksheet("Chart")!.getCell("A2").value).toBe("00123");
    expect(workbook.getWorksheet("Sites")!.getCell("F2").value).toBe(4);
    expect(workbook.getWorksheet("Sites")!.getCell("I2").value).toBe(true);
    expect(generated).toMatchObject({
      filename: "patient-report.xlsx",
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  });
});
