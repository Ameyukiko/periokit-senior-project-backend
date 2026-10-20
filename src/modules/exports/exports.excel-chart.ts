import type ExcelJS from "exceljs";
import type { ExportSnapshot } from "./exports.snapshot";

type ChartTooth = NonNullable<ExportSnapshot["chart"]>["teeth"][number];
type SurfaceName = "buccal" | "palatal" | "lingual";

const UPPER_TEETH = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_TEETH = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
const SITE_INDEX: Record<string, number> = {
  MB: 0, B: 1, DB: 2,
  MP: 0, P: 1, DP: 2,
  ML: 0, L: 1, DL: 2,
};

const COLORS = {
  border: "FF595959",
  cal: "FFFFF2CC",
  pd: "FFDDEBF7",
  recession: "FFF4CCCC",
  unavailable: "FF8C8C8C",
  missing: "FFA6A6A6",
  implant: "FFD9EAF7",
  title: "FFFFFF00",
  blue: "FF5B9BD5",
  danger: "FFFF0000",
};

const fill = (argb: string): ExcelJS.Fill => ({
  type: "pattern",
  pattern: "solid",
  fgColor: { argb },
});

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: COLORS.border } },
  left: { style: "thin", color: { argb: COLORS.border } },
  bottom: { style: "thin", color: { argb: COLORS.border } },
  right: { style: "thin", color: { argb: COLORS.border } },
};

const cellValue = (value: number | null) => value === null ? null : value;
const gradeValue = (grade: string) => {
  if (grade === "none") return null;
  const parsed = Number(grade.replace("grade_", ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const toothStartColumn = (index: number) => 4 + index * 3;

const forCells = (
  sheet: ExcelJS.Worksheet,
  fromRow: number,
  fromColumn: number,
  toRow: number,
  toColumn: number,
  apply: (cell: ExcelJS.Cell) => void,
) => {
  for (let row = fromRow; row <= toRow; row += 1) {
    for (let column = fromColumn; column <= toColumn; column += 1) {
      apply(sheet.getCell(row, column));
    }
  }
};

const setMergedValue = (
  sheet: ExcelJS.Worksheet,
  row: number,
  startColumn: number,
  value: ExcelJS.CellValue,
) => {
  sheet.mergeCells(row, startColumn, row, startColumn + 2);
  sheet.getCell(row, startColumn).value = value;
};

const siteAt = (tooth: ChartTooth, surface: SurfaceName, index: number) =>
  tooth.sites.find((site) => site.surface === surface && SITE_INDEX[site.position] === index);

const ktwAt = (tooth: ChartTooth, surface: SurfaceName) =>
  tooth.surfaces.find((item) => item.surface === surface)?.ktwMm ?? null;

const furcationSlots = (toothNumber: number, surface: SurfaceName) => {
  const upperMolar = [18, 17, 16, 26, 27, 28].includes(toothNumber);
  const lowerMolar = [48, 47, 46, 36, 37, 38].includes(toothNumber);
  if (surface === "buccal" && (upperMolar || lowerMolar)) return [1];
  if (surface === "palatal" && upperMolar) return [0, 2];
  if (surface === "lingual" && lowerMolar) return [1];
  return [];
};

const setClinicalValue = (cell: ExcelJS.Cell, value: number | null, flagDeep = false) => {
  cell.value = cellValue(value);
  if (flagDeep && value !== null && value >= 5) {
    cell.font = { ...cell.font, color: { argb: COLORS.danger }, bold: true };
  }
};

const renderSurface = (
  sheet: ExcelJS.Worksheet,
  tooth: ChartTooth,
  startColumn: number,
  surface: SurfaceName,
  rows: { furcation: number; ktw?: number; bop: number; cal: number; pd: number; recession: number },
) => {
  if (rows.ktw) setMergedValue(sheet, rows.ktw, startColumn, cellValue(ktwAt(tooth, surface)));
  for (let index = 0; index < 3; index += 1) {
    const column = startColumn + index;
    const site = siteAt(tooth, surface, index);
    sheet.getCell(rows.bop, column).value = site?.bop ? 1 : null;
    setClinicalValue(sheet.getCell(rows.cal, column), site?.calMm ?? null, true);
    setClinicalValue(sheet.getCell(rows.pd, column), site?.pdMm ?? null, true);
    setClinicalValue(sheet.getCell(rows.recession, column), site?.recessionMm ?? null);
  }

  for (const index of furcationSlots(tooth.number, surface)) {
    sheet.getCell(rows.furcation, startColumn + index).fill = fill("FFFFFFFF");
  }
  for (const furcation of tooth.furcations.filter((item) => item.surface === surface)) {
    if (furcation.siteIndex < 0 || furcation.siteIndex > 2) continue;
    sheet.getCell(rows.furcation, startColumn + furcation.siteIndex).value = gradeValue(furcation.grade);
  }
};

const mergeSideLabel = (sheet: ExcelJS.Worksheet, range: string, value: string) => {
  sheet.mergeCells(range);
  sheet.getCell(range.split(":")[0]).value = value;
};

const formatPercent = (cell: ExcelJS.Cell, value: number | null | undefined) => {
  cell.value = value ?? null;
  cell.numFmt = "0.00";
};

const renderSummary = (
  sheet: ExcelJS.Worksheet,
  snapshot: ExportSnapshot,
  includePatientDetails: boolean,
) => {
  const chart = snapshot.chart;
  if (!chart) return;
  const present = chart.teeth.filter((tooth) => tooth.status !== "missing");
  const sites = present.flatMap((tooth) => tooth.sites);
  const numericPd = sites.flatMap((site) => site.pdMm === null ? [] : [site.pdMm]);
  const numericCal = sites.flatMap((site) => site.calMm === null ? [] : [site.calMm]);
  const average = (values: number[]) => values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
  const percentage = (count: number, total: number) => total ? (count / total) * 100 : null;

  sheet.mergeCells("BA2:BA3");
  sheet.getCell("BA2").value = chart.name?.trim() || "Chart";
  sheet.getCell("BA2").fill = fill(COLORS.title);
  sheet.getCell("BA2").font = { name: "Arial", size: 16, bold: true };
  sheet.getCell("BA2").alignment = { horizontal: "center", vertical: "middle" };
  [["BB2", "Mean PD"], ["BC2", "Mean CAL"], ["BD2", "BOP"], ["BE2", "PI"]]
    .forEach(([address, label]) => { sheet.getCell(address).value = label; });
  sheet.getCell("BB3").value = average(numericPd);
  sheet.getCell("BC3").value = average(numericCal);
  formatPercent(sheet.getCell("BD3"), chart.summary?.bopPercentage);
  formatPercent(sheet.getCell("BE3"), chart.summary?.plaquePercentage);
  forCells(sheet, 3, 54, 3, 57, (cell) => { cell.numFmt = "0.00"; });

  sheet.getCell("BA7").value = "Present teeth";
  sheet.getCell("BA8").value = present.length;
  sheet.getCell("BA9").value = sites.length;
  [["BB7", "CAL"], ["BC7", "Sites"], ["BD7", "%"], ["BF7", "PD"], ["BG7", "Sites"], ["BH7", "%"]]
    .forEach(([address, label]) => { sheet.getCell(address).value = label; });

  const bands = [
    { label: "≤ 0", test: (value: number) => value <= 0 },
    { label: "1–2", test: (value: number) => value >= 1 && value <= 2 },
    { label: "3–4", test: (value: number) => value >= 3 && value <= 4 },
    { label: "5+", test: (value: number) => value >= 5 },
  ];
  bands.forEach((band, index) => {
    const row = 8 + index;
    const calCount = numericCal.filter(band.test).length;
    const pdCount = numericPd.filter(band.test).length;
    sheet.getCell(row, 54).value = band.label;
    sheet.getCell(row, 55).value = calCount;
    formatPercent(sheet.getCell(row, 56), percentage(calCount, numericCal.length));
    sheet.getCell(row, 58).value = band.label;
    sheet.getCell(row, 59).value = pdCount;
    formatPercent(sheet.getCell(row, 60), percentage(pdCount, numericPd.length));
  });

  sheet.getCell("BB13").value = "Mobility";
  sheet.getCell("BC13").value = "Teeth";
  sheet.getCell("BD13").value = "%";
  [1, 2, 3].forEach((grade, index) => {
    const row = 14 + index;
    const count = present.filter((tooth) => tooth.mobility === grade).length;
    sheet.getCell(row, 54).value = `${grade}${grade === 1 ? "st" : grade === 2 ? "nd" : "rd"}`;
    sheet.getCell(row, 55).value = count;
    formatPercent(sheet.getCell(row, 56), percentage(count, present.length));
  });

  sheet.getCell("BB18").value = "BOP";
  formatPercent(sheet.getCell("BC18"), chart.summary?.bopPercentage);
  sheet.getCell("BB22").value = "PI";
  formatPercent(sheet.getCell("BC22"), chart.summary?.plaquePercentage);

  if (includePatientDetails) {
    for (let row = 25; row <= 30; row += 1) sheet.mergeCells(row, 54, row, 57);
    sheet.getCell("BA25").value = "HN";
    sheet.getCell("BB25").value = snapshot.patient.hn;
    sheet.getCell("BB25").numFmt = "@";
    sheet.getCell("BA26").value = "Patient";
    sheet.getCell("BB26").value = [snapshot.patient.firstName, snapshot.patient.lastName].filter(Boolean).join(" ");
    sheet.getCell("BA27").value = "Visit date";
    sheet.getCell("BB27").value = snapshot.visit.date;
    sheet.getCell("BA28").value = "Phase";
    sheet.getCell("BB28").value = snapshot.visit.phase;
    sheet.getCell("BA29").value = "Doctor";
    sheet.getCell("BB29").value = snapshot.visit.doctorName ?? "";
    sheet.getCell("BA30").value = "Doctor ID";
    sheet.getCell("BB30").value = snapshot.visit.studentId ?? "";
    forCells(sheet, 25, 53, 30, 53, (cell) => {
      cell.font = { name: "Arial", size: 10, bold: true };
    });
  }
}

export const buildClinicalChartWorksheet = (
  workbook: ExcelJS.Workbook,
  snapshot: ExportSnapshot,
  includePatientDetails = true,
) => {
  const sheet = workbook.addWorksheet("Chart", {
    views: [{ zoomScale: 90, showGridLines: false }],
    pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
    properties: { defaultRowHeight: 18 },
  });
  sheet.pageSetup.margins = { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 };
  sheet.getColumn(1).width = 2.5;
  sheet.getColumn(2).width = 13;
  sheet.getColumn(3).width = 8;
  for (let column = 4; column <= 51; column += 1) sheet.getColumn(column).width = 3;
  sheet.getColumn(52).width = 2.5;
  for (let column = 53; column <= 60; column += 1) sheet.getColumn(column).width = 10;
  sheet.getColumn(53).width = 14;
  sheet.getColumn(54).width = 12;
  sheet.getColumn(58).width = 12;
  sheet.getColumn(55).width = 9;
  sheet.getColumn(59).width = 9;

  mergeSideLabel(sheet, "B2:C2", "Furcation involvement");
  mergeSideLabel(sheet, "B3:C3", "Keratinized tissue width");
  mergeSideLabel(sheet, "B4:C4", "BOP");
  mergeSideLabel(sheet, "B5:B7", "Buccal");
  sheet.getCell("C5").value = "CAL"; sheet.getCell("C6").value = "PD"; sheet.getCell("C7").value = "GR";
  mergeSideLabel(sheet, "B8:C8", "Mobility");
  mergeSideLabel(sheet, "B9:C9", "Upper arch");
  mergeSideLabel(sheet, "B11:B13", "Palatal");
  sheet.getCell("C11").value = "GR"; sheet.getCell("C12").value = "PD"; sheet.getCell("C13").value = "CAL";
  mergeSideLabel(sheet, "B14:C14", "BOP");
  mergeSideLabel(sheet, "B15:C15", "Furcation involvement");
  mergeSideLabel(sheet, "B17:C17", "Furcation involvement");
  mergeSideLabel(sheet, "B18:C18", "BOP");
  mergeSideLabel(sheet, "B19:B21", "Lingual");
  sheet.getCell("C19").value = "CAL"; sheet.getCell("C20").value = "PD"; sheet.getCell("C21").value = "GR";
  mergeSideLabel(sheet, "B23:C23", "Lower arch");
  mergeSideLabel(sheet, "B24:C24", "Mobility");
  mergeSideLabel(sheet, "B25:B27", "Buccal");
  sheet.getCell("C25").value = "GR"; sheet.getCell("C26").value = "PD"; sheet.getCell("C27").value = "CAL";
  mergeSideLabel(sheet, "B28:C28", "BOP");
  mergeSideLabel(sheet, "B29:C29", "Keratinized tissue width");
  mergeSideLabel(sheet, "B30:C30", "Furcation involvement");

  forCells(sheet, 2, 2, 30, 60, (cell) => {
    cell.font = { name: "Arial", size: 10, color: { argb: "FF111827" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  forCells(sheet, 2, 2, 30, 3, (cell) => {
    cell.alignment = { horizontal: "right", vertical: "middle" };
  });
  forCells(sheet, 2, 4, 30, 51, (cell) => { cell.border = thinBorder; });
  [2, 15, 17, 30].forEach((row) => {
    forCells(sheet, row, 4, row, 51, (cell) => { cell.fill = fill(COLORS.unavailable); });
  });
  [5, 13, 19, 27].forEach((row) => {
    forCells(sheet, row, 4, row, 51, (cell) => { cell.fill = fill(COLORS.cal); });
  });
  [6, 12, 20, 26].forEach((row) => {
    forCells(sheet, row, 4, row, 51, (cell) => { cell.fill = fill(COLORS.pd); });
  });
  [7, 11, 21, 25].forEach((row) => {
    forCells(sheet, row, 4, row, 51, (cell) => { cell.fill = fill(COLORS.recession); });
  });
  sheet.getRow(9).height = 26;
  sheet.getRow(23).height = 26;

  const teethByNumber = new Map((snapshot.chart?.teeth ?? []).map((tooth) => [tooth.number, tooth]));
  const renderArch = (teeth: number[], upper: boolean) => teeth.forEach((number, index) => {
    const startColumn = toothStartColumn(index);
    const tooth = teethByNumber.get(number);
    setMergedValue(sheet, upper ? 9 : 23, startColumn, number);
    sheet.getCell(upper ? 9 : 23, startColumn).font = { name: "Arial", size: 14, bold: true };
    setMergedValue(sheet, upper ? 10 : 22, startColumn, null);
    setMergedValue(sheet, upper ? 8 : 24, startColumn, tooth?.mobility ?? null);
    if (!tooth) return;

    if (tooth.status === "missing") {
      const statusCell = sheet.getCell(upper ? 10 : 22, startColumn);
      statusCell.value = "x";
      statusCell.fill = fill(COLORS.missing);
      return;
    }
    if (tooth.status === "implant") {
      const statusCell = sheet.getCell(upper ? 10 : 22, startColumn);
      statusCell.value = "I";
      statusCell.fill = fill(COLORS.implant);
    }

    if (upper) {
      renderSurface(sheet, tooth, startColumn, "buccal", { furcation: 2, ktw: 3, bop: 4, cal: 5, pd: 6, recession: 7 });
      renderSurface(sheet, tooth, startColumn, "palatal", { furcation: 15, bop: 14, cal: 13, pd: 12, recession: 11 });
    } else {
      renderSurface(sheet, tooth, startColumn, "lingual", { furcation: 17, bop: 18, cal: 19, pd: 20, recession: 21 });
      renderSurface(sheet, tooth, startColumn, "buccal", { furcation: 30, ktw: 29, bop: 28, cal: 27, pd: 26, recession: 25 });
    }
  });
  renderArch(UPPER_TEETH, true);
  renderArch(LOWER_TEETH, false);

  for (let index = 0; index < 16; index += 1) {
    const start = toothStartColumn(index);
    for (let row = 2; row <= 30; row += 1) {
      if (row === 16) continue;
      const left = sheet.getCell(row, start);
      const right = sheet.getCell(row, start + 2);
      left.border = { ...left.border, left: { style: "medium", color: { argb: COLORS.border } } };
      right.border = { ...right.border, right: { style: "medium", color: { argb: COLORS.border } } };
    }
  }
  forCells(sheet, 9, 2, 9, 51, (cell) => { cell.font = { name: "Arial", size: 14, bold: true }; });
  forCells(sheet, 23, 2, 23, 51, (cell) => { cell.font = { name: "Arial", size: 14, bold: true }; });
  renderSummary(sheet, snapshot, includePatientDetails);
  sheet.autoFilter = undefined;
  sheet.pageSetup.printArea = "B2:BH30";
  return sheet;
};
