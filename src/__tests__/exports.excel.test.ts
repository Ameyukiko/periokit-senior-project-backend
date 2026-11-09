import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { generateExport } from "../modules/exports/exports.generator";
import { exportSnapshotFixture } from "./exports.fixture";

describe("Excel export", () => {
  it("creates only the chart sheet and preserves clinical value types", async () => {
    const snapshot = exportSnapshotFixture();
    snapshot.chart!.teeth.push(
      {
        number: 18, arch: "upper", status: "missing", mobility: null,
        prognosisKc: null, prognosisMn: null, note: null,
        surfaces: [], sites: [], furcations: [],
      },
      {
        number: 28, arch: "upper", status: "implant", mobility: null,
        prognosisKc: null, prognosisMn: null, note: null,
        surfaces: [], sites: [], furcations: [],
      },
      {
        number: 16, arch: "upper", status: "present", mobility: null,
        prognosisKc: null, prognosisMn: null, note: null,
        surfaces: [], sites: [],
        furcations: [{ surface: "buccal", siteIndex: 1, grade: "grade_2" }],
      },
    );
    const generated = await generateExport(
      snapshot,
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
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Chart"]);
    const chart = workbook.getWorksheet("Chart")!;
    expect(chart.getCell("Y9").value).toBe(11);
    expect(chart.getCell("Y3").value).toBe(3.5);
    expect(chart.getCell("Y4").value).toBe(1);
    expect(chart.getCell("Y5").value).toBe(5);
    expect(chart.getCell("Y6").value).toBe(4);
    expect(chart.getCell("Y7").value).toBe(1);
    expect(chart.getCell("BB25").value).toBe("00123");
    expect(chart.getCell("BB25").numFmt).toBe("@");
    expect(chart.getCell("BB26").value).toBe("Ada Lovelace");
    expect(chart.getCell("D10").value).toBe("x");
    expect(chart.getCell("AW10").value).toBe("I");
    expect(chart.getCell("K2").value).toBe(2);
    expect(chart.pageSetup.orientation).toBe("landscape");
    expect(generated).toMatchObject({
      filename: "patient-report.xlsx",
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  });

  it("omits patient and visit metadata when disabled", async () => {
    const generated = await generateExport(
      exportSnapshotFixture(),
      {
        format: "excel",
        includePatientDetails: false,
        sections: ["chart"],
        paperSize: "a4",
        orientations: {},
        grayscale: false,
        baseFilename: "anonymous-chart",
        expectedSnapshotVersion: "a".repeat(43),
      },
      [],
      new AbortController().signal
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(generated.body as any);
    const chart = workbook.getWorksheet("Chart")!;
    expect(chart.getCell("BA25").value).toBeNull();
    expect(chart.getCell("BB25").value).toBeNull();
    expect(chart.getCell("BB30").value).toBeNull();
  });
});
