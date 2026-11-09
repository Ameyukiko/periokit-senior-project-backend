import {
  defaultOrientation,
  pageDimensions,
  type ExportPageName,
  type PageOrientation,
  type PaperSize,
  type PreviewExportRequest,
} from "./exports.contract";
import type { ExportAssetMap } from "./exports.assets";
import type { ExportSnapshot } from "./exports.snapshot";
import type { SectionAvailability } from "./exports.snapshot";

export const EXPORT_RENDERER_PROTOCOL_VERSION = "1.0" as const;

export const EXPORT_SECTION_TITLES: Record<ExportPageName, string> = {
  patientDetails: "Patient and visit details",
  chart: "Periodontal chart",
  diagnosis: "Periodontal diagnosis",
  images: "Images",
  imageNotes: "Image notes",
  notes: "Clinical notes",
};

export type ExportRenderPageModel = {
  id: string;
  section: ExportPageName;
  title: string;
  pageNumber: number;
  pageCount: number;
  widthMm: number;
  heightMm: number;
  orientation: PageOrientation;
};

export type ExportRenderModel = {
  protocolVersion: typeof EXPORT_RENDERER_PROTOCOL_VERSION;
  snapshotVersion: string;
  generatedAt: string;
  options: {
    format: PreviewExportRequest["format"];
    paperSize: PaperSize;
    grayscale: boolean;
    includePatientDetails: boolean;
    includeImageNotes: boolean;
  };
  pages: ExportRenderPageModel[];
  patient: Pick<
    ExportSnapshot["patient"],
    "hn" | "firstName" | "lastName" | "age" | "gender" | "nationality" | "note"
  >;
  visit: Pick<
    ExportSnapshot["visit"],
    "date" | "phase" | "doctorName" | "studentId" | "clinicalNote" | "status"
  >;
  chart: ExportSnapshot["chart"];
  diagnosis: ExportSnapshot["diagnosis"];
  imageBoard: null | {
    status: string;
    objects: NonNullable<ExportSnapshot["xray"]>["objects"];
    assets: Array<{
      id: string;
      source: string;
      naturalWidth: number;
      naturalHeight: number;
    }>;
  };
};

export type ExportSourceModel = Omit<ExportRenderModel, "options" | "pages"> & {
  rendererVersion: string;
  availability: SectionAvailability;
};

export const buildExportRenderModel = (
  snapshot: ExportSnapshot,
  request: PreviewExportRequest,
  assets: ExportAssetMap,
  generatedAt = new Date().toISOString()
): ExportRenderModel => {
  const sections = request.sections.filter((section) => section !== "imageNotes");
  const pageCount = sections.length;
  const pages = sections.map((section, index) => {
    const orientation = request.orientations[section] ?? defaultOrientation(section);
    const dimensions = pageDimensions(request.paperSize, orientation);
    return {
      id: `${index + 1}-${section}`,
      section,
      title: EXPORT_SECTION_TITLES[section],
      pageNumber: index + 1,
      pageCount,
      widthMm: dimensions.width,
      heightMm: dimensions.height,
      orientation,
    };
  });

  return {
    protocolVersion: EXPORT_RENDERER_PROTOCOL_VERSION,
    snapshotVersion: snapshot.snapshotVersion,
    generatedAt,
    options: {
      format: request.format,
      paperSize: request.paperSize,
      grayscale: request.grayscale,
      includePatientDetails: request.includePatientDetails !== false,
      includeImageNotes: request.includeImageNotes ?? request.sections.includes("imageNotes"),
    },
    pages,
    patient: {
      hn: snapshot.patient.hn,
      firstName: snapshot.patient.firstName,
      lastName: snapshot.patient.lastName,
      age: snapshot.patient.age,
      gender: snapshot.patient.gender,
      nationality: snapshot.patient.nationality,
      note: snapshot.patient.note,
    },
    visit: {
      date: snapshot.visit.date,
      phase: snapshot.visit.phase,
      doctorName: snapshot.visit.doctorName,
      studentId: snapshot.visit.studentId,
      clinicalNote: snapshot.visit.clinicalNote,
      status: snapshot.visit.status,
    },
    chart: snapshot.chart,
    diagnosis: snapshot.diagnosis,
    imageBoard: snapshot.xray
      ? {
          status: snapshot.xray.status,
          objects: snapshot.xray.objects,
          assets: snapshot.xray.assets.flatMap((asset) => {
            const source = assets.get(asset.id);
            return source
              ? [{
                  id: asset.id,
                  source,
                  naturalWidth: asset.naturalWidth,
                  naturalHeight: asset.naturalHeight,
                }]
              : [];
          }),
        }
      : null,
  };
};

export const buildExportSourceModel = (
  snapshot: ExportSnapshot,
  assets: ExportAssetMap,
  rendererVersion: string,
  availability: SectionAvailability,
  generatedAt = new Date().toISOString()
): ExportSourceModel => {
  const model = buildExportRenderModel(
    snapshot,
    {
      format: "pdf",
      sections: [],
      paperSize: "a4",
      orientations: {},
      grayscale: false,
      baseFilename: "periodontal-report",
    },
    assets,
    generatedAt
  );
  const { options: _options, pages: _pages, ...source } = model;
  return { ...source, rendererVersion, availability };
};
