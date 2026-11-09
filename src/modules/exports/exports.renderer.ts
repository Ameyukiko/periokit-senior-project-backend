import { env } from "../../lib/env";
import {
  defaultOrientation,
  pageDimensions,
  type ExportPageName,
  type PageOrientation,
  type PaperSize,
  type PreviewExportRequest,
} from "./exports.contract";
import type { ExportAssetMap } from "./exports.assets";
import { ExportError } from "./exports.errors";
import type { ExportSnapshot } from "./exports.snapshot";

export type RenderedPage = {
  id: string;
  section: ExportPageName;
  title: string;
  pageNumber: number;
  widthMm: number;
  heightMm: number;
  orientation: PageOrientation;
  html: string;
};

export type RenderedReport = {
  pages: RenderedPage[];
  warnings: Array<{ code: string; section: ExportPageName; message: string }>;
};

const SECTION_TITLES: Record<ExportPageName, string> = {
  patientDetails: "Patient and visit details",
  chart: "Periodontal chart",
  diagnosis: "Periodontal diagnosis",
  images: "Images",
  imageNotes: "Image notes",
  notes: "Clinical notes",
};

export const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const display = (value: unknown) =>
  value === null || value === undefined || value === "" ? "—" : escapeHtml(value);

const humanize = (value: string) =>
  value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^./, (first: string) => first.toUpperCase());

const flattenObject = (
  value: unknown,
  prefix = ""
): Array<{ field: string; value: string }> => {
  if (value === null || typeof value !== "object") {
    return [{ field: prefix || "Value", value: value === null ? "—" : String(value) }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => flattenObject(item, `${prefix} ${index + 1}`.trim()));
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) =>
    flattenObject(item, `${prefix}${prefix ? " / " : ""}${humanize(key)}`)
  );
};

const keyValueGrid = (rows: Array<[string, unknown]>) => `
  <div class="kv-grid">
    ${rows
      .map(
        ([label, value]) => `
          <div class="kv-item"><div class="kv-label">${escapeHtml(label)}</div><div class="kv-value">${display(value)}</div></div>`
      )
      .join("")}
  </div>`;

const renderPatientDetails = (snapshot: ExportSnapshot) =>
  keyValueGrid([
    ["HN", snapshot.patient.hn],
    ["Patient", `${snapshot.patient.firstName} ${snapshot.patient.lastName}`.trim()],
    ["Age", snapshot.patient.age],
    ["Gender", snapshot.patient.gender],
    ["Nationality", snapshot.patient.nationality],
    ["Visit date", snapshot.visit.date],
    ["Phase", humanize(snapshot.visit.phase)],
    ["Visit status", humanize(snapshot.visit.status)],
    ["Clinician", snapshot.visit.doctorName],
    ["Student ID", snapshot.visit.studentId],
  ]);

const maxSiteValue = (
  sites: NonNullable<ExportSnapshot["chart"]>["teeth"][number]["sites"],
  key: "pdMm" | "calMm"
) => {
  const values = sites.flatMap((site) => (site[key] === null ? [] : [site[key]]));
  return values.length ? Math.max(...values) : null;
};

const renderChart = (snapshot: ExportSnapshot) => {
  const chart = snapshot.chart!;
  const rows = chart.teeth
    .map((tooth) => {
      const bop = tooth.sites.filter((site) => site.bop).length;
      const plaque = tooth.sites.filter((site) => site.plaque).length;
      return `<tr>
        <td>${tooth.number}</td><td>${display(tooth.arch)}</td><td>${display(tooth.status)}</td>
        <td>${display(tooth.mobility)}</td><td>${display(maxSiteValue(tooth.sites, "pdMm"))}</td>
        <td>${display(maxSiteValue(tooth.sites, "calMm"))}</td><td>${bop}</td><td>${plaque}</td>
        <td>${display(tooth.prognosisKc)}</td><td>${display(tooth.prognosisMn)}</td>
      </tr>`;
    })
    .join("");
  return `${keyValueGrid([
    ["Chart", chart.name],
    ["Total teeth", chart.summary?.totalTeeth],
    ["BOP", chart.summary?.bopPercentage == null ? null : `${chart.summary.bopPercentage}%`],
    ["Plaque", chart.summary?.plaquePercentage == null ? null : `${chart.summary.plaquePercentage}%`],
  ])}
  <table><thead><tr><th>Tooth</th><th>Arch</th><th>Status</th><th>Mobility</th><th>Max PD</th><th>Max CAL</th><th>BOP sites</th><th>Plaque sites</th><th>KC</th><th>MN</th></tr></thead><tbody>${rows}</tbody></table>`;
};

const renderDiagnosis = (snapshot: ExportSnapshot) => {
  const diagnosis = snapshot.diagnosis!;
  const rows = flattenObject(diagnosis.complexity);
  return `${keyValueGrid([["Extent", diagnosis.extent]])}
    <table><thead><tr><th>Assessment</th><th>Value</th></tr></thead><tbody>
      ${rows.map((row) => `<tr><td>${escapeHtml(row.field)}</td><td>${display(row.value)}</td></tr>`).join("")}
    </tbody></table>`;
};

const renderXray = (
  snapshot: ExportSnapshot,
  assets: ExportAssetMap,
  includeImageNotes: boolean,
) => {
  const objects = snapshot.xray!.objects.filter(
    (object) => includeImageNotes || object.objectType === "image"
  );
  const maxX = Math.max(1000, ...objects.map((object) => object.posX + object.width));
  const maxY = Math.max(650, ...objects.map((object) => object.posY + object.height));
  return `<div class="xray-board" style="aspect-ratio:${maxX}/${maxY}">
    ${objects
      .map((object) => {
        const left = Math.max(0, Math.min(100, (object.posX / maxX) * 100));
        const top = Math.max(0, Math.min(100, (object.posY / maxY) * 100));
        const width = Math.max(0.1, Math.min(100 - left, (object.width / maxX) * 100));
        const height = Math.max(0.1, Math.min(100 - top, (object.height / maxY) * 100));
        const common = `left:${left}%;top:${top}%;width:${width}%;height:${height}%;transform:rotate(${object.rotation}deg);z-index:${object.zIndex}`;
        if (object.objectType === "image" && object.assetId) {
          const source = assets.get(object.assetId);
          if (!source) return "";
          return `<img class="xray-object" style="${common}" src="${source}" alt="Image ${escapeHtml(object.slotCode ?? "image")}">`;
        }
        return `<div class="xray-object xray-note" style="${common};color:${object.noteColor ?? "#111827"};font-size:${object.noteFontSize ?? 14}px">${escapeHtml(object.noteText)}</div>`;
      })
      .join("")}
  </div>`;
};

const renderNotes = (snapshot: ExportSnapshot) => {
  const toothNotes = snapshot.chart?.teeth.filter((tooth) => tooth.note?.trim()) ?? [];
  return `<section class="note-block"><h2>Patient note</h2><div class="pre">${display(snapshot.patient.note)}</div></section>
    <section class="note-block"><h2>Visit clinical note</h2><div class="pre">${display(snapshot.visit.clinicalNote)}</div></section>
    ${toothNotes.length ? `<section class="note-block"><h2>Tooth notes</h2><table><thead><tr><th>Tooth</th><th>Note</th></tr></thead><tbody>${toothNotes.map((tooth) => `<tr><td>${tooth.number}</td><td class="pre">${escapeHtml(tooth.note)}</td></tr>`).join("")}</tbody></table></section>` : ""}`;
};

const renderBody = (
  section: ExportPageName,
  snapshot: ExportSnapshot,
  assets: ExportAssetMap,
  includeImageNotes: boolean
) => {
  switch (section) {
    case "patientDetails": return renderPatientDetails(snapshot);
    case "chart": return renderChart(snapshot);
    case "diagnosis": return renderDiagnosis(snapshot);
    case "images": return renderXray(snapshot, assets, includeImageNotes);
    case "imageNotes": return "";
    case "notes": return renderNotes(snapshot);
  }
};

const reportStyles = (widthMm: number, heightMm: number) => `
  @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: white; color: #172033; font-family: "Noto Sans Thai", "Noto Sans", "Arial", "Liberation Sans", sans-serif; }
  body { width: ${widthMm}mm; height: ${heightMm}mm; }
  .page { width: 100%; height: 100%; padding: 10mm 11mm 9mm; display: flex; flex-direction: column; overflow: hidden; }
  .grayscale { filter: grayscale(1); }
  header { display: flex; justify-content: space-between; gap: 8mm; padding-bottom: 3mm; border-bottom: .4mm solid #164e63; }
  .brand { color: #164e63; font-size: 16pt; font-weight: 700; }
  .patient { text-align: right; font-size: 8.5pt; line-height: 1.45; }
  h1 { margin: 4mm 0 3mm; color: #0f172a; font-size: 17pt; }
  h2 { margin: 0 0 2mm; font-size: 11pt; color: #164e63; }
  main { flex: 1; min-height: 0; overflow: hidden; font-size: 8.5pt; }
  footer { border-top: .25mm solid #cbd5e1; padding-top: 2mm; margin-top: 3mm; display: flex; justify-content: space-between; color: #64748b; font-size: 7.5pt; }
  .kv-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2mm 5mm; margin-bottom: 4mm; }
  .kv-item { border-bottom: .2mm solid #e2e8f0; padding: 1.5mm 0; }
  .kv-label { color: #64748b; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .03em; }
  .kv-value { margin-top: .8mm; font-weight: 600; overflow-wrap: anywhere; }
  table { width: 100%; border-collapse: collapse; font-size: 7.3pt; }
  th, td { border: .2mm solid #cbd5e1; padding: 1.1mm 1.4mm; text-align: left; vertical-align: top; }
  th { background: #e8f3f5; color: #164e63; font-weight: 700; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  .pre { white-space: pre-wrap; overflow-wrap: anywhere; }
  .note-block { margin-bottom: 4mm; }
  .xray-board { position: relative; width: 100%; max-height: 100%; margin: 0 auto; overflow: hidden; background: #111827; border-radius: 1.5mm; }
  .xray-object { position: absolute; transform-origin: center; object-fit: contain; }
  .xray-note { white-space: pre-wrap; overflow: hidden; padding: 1mm; background: rgba(255,255,255,.88); }
`;

const standaloneHtml = (
  snapshot: ExportSnapshot,
  section: ExportPageName,
  body: string,
  pageNumber: number,
  pageCount: number,
  widthMm: number,
  heightMm: number,
  generatedAt: string,
  grayscale: boolean,
  includePatientDetails: boolean
) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${reportStyles(widthMm, heightMm)}</style></head>
  <body><article class="page${grayscale ? " grayscale" : ""}">
    <header><div class="brand">PerioKit</div>${includePatientDetails ? `<div class="patient"><strong>${escapeHtml(snapshot.patient.firstName)} ${escapeHtml(snapshot.patient.lastName)}</strong><br>HN ${escapeHtml(snapshot.patient.hn)} · Visit ${escapeHtml(snapshot.visit.date)}<br>${escapeHtml(snapshot.visit.doctorName ?? "Clinician not recorded")}</div>` : ""}</header>
    <h1>${escapeHtml(SECTION_TITLES[section])}</h1><main>${body}</main>
    <footer><span>Generated ${escapeHtml(generatedAt)}</span><span>Page ${pageNumber} of ${pageCount}</span></footer>
  </article></body></html>`;

const containsNull = (value: unknown): boolean => {
  if (value === null || value === "") return true;
  if (Array.isArray(value)) return value.some(containsNull);
  if (typeof value === "object" && value) return Object.values(value).some(containsNull);
  return false;
};

export const renderReport = (
  snapshot: ExportSnapshot,
  request: PreviewExportRequest,
  assets: ExportAssetMap,
  generatedAt = new Date().toISOString()
): RenderedReport => {
  const includeImageNotes = request.includeImageNotes
    ?? request.sections.includes("imageNotes");
  const sections: ExportPageName[] = request.sections.filter(
    (section) => section !== "imageNotes"
  );
  if (sections.length > env.EXPORT_MAX_PAGES) {
    throw new ExportError(422, "EXPORT_LIMIT_EXCEEDED", "Too many report pages", {
      limit: env.EXPORT_MAX_PAGES,
    });
  }

  const pages = sections.map((section, index) => {
    const orientation = request.orientations[section] ?? defaultOrientation(section);
    const dimensions = pageDimensions(request.paperSize as PaperSize, orientation);
    const body = renderBody(section, snapshot, assets, includeImageNotes);
    return {
      id: `${index + 1}-${section}`,
      section,
      title: SECTION_TITLES[section],
      pageNumber: index + 1,
      widthMm: dimensions.width,
      heightMm: dimensions.height,
      orientation,
      html: standaloneHtml(
        snapshot,
        section,
        body,
        index + 1,
        sections.length,
        dimensions.width,
        dimensions.height,
        generatedAt,
        request.grayscale,
        request.includePatientDetails !== false
      ),
    };
  });

  const warnings: RenderedReport["warnings"] = [];
  if (request.sections.includes("diagnosis") && containsNull(snapshot.diagnosis?.complexity)) {
    warnings.push({
      code: "DIAGNOSIS_INCOMPLETE",
      section: "diagnosis",
      message: "The saved diagnosis contains incomplete fields.",
    });
  }
  return { pages, warnings };
};
