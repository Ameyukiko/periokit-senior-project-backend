import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { env } from "../../lib/env";
import { prisma } from "../../lib/prisma";
import type { ExportSectionName } from "./exports.contract";
import { ExportError, throwIfAborted } from "./exports.errors";

const canvasObjectSchema = z
  .object({
    id: z.string().uuid(),
    objectType: z.enum(["image", "note"]),
    zIndex: z.number().int(),
    posX: z.number().finite(),
    posY: z.number().finite(),
    width: z.number().positive().finite(),
    height: z.number().positive().finite(),
    rotation: z.number().min(0).lt(360).default(0),
    assetId: z.string().uuid().nullable(),
    slotCode: z.string().nullable(),
    noteText: z.string().max(5000).nullable(),
    noteColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
    noteFontSize: z.number().int().min(8).max(72).nullable(),
  })
  .superRefine((object, context) => {
    if (object.objectType === "image" && !object.assetId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assetId"],
        message: "Image object is missing an asset reference",
      });
    }
  });

const canvasSchema = z.object({ elements: z.array(canvasObjectSchema) });

export type ExportXrayObject = z.infer<typeof canvasObjectSchema>;

export type ExportSnapshot = {
  snapshotVersion: string;
  patient: {
    id: string;
    hn: string;
    firstName: string;
    lastName: string;
    age: number | null;
    gender: string | null;
    nationality: string | null;
    note: string | null;
    updatedAt: string;
  };
  visit: {
    id: string;
    date: string;
    phase: string;
    doctorName: string | null;
    studentId: string | null;
    clinicalNote: string | null;
    status: string;
    updatedAt: string;
  };
  chart: null | {
    id: string;
    name: string | null;
    status: string;
    updatedAt: string;
    summary: null | {
      totalTeeth: number | null;
      bopPercentage: number | null;
      plaquePercentage: number | null;
    };
    teeth: Array<{
      number: number;
      arch: string;
      status: string;
      mobility: number | null;
      prognosisKc: string | null;
      prognosisMn: string | null;
      note: string | null;
      surfaces: Array<{ surface: string; ktwMm: number | null }>;
      sites: Array<{
        surface: string;
        position: string;
        pdMm: number | null;
        recessionMm: number | null;
        calMm: number | null;
        bop: boolean;
        plaque: boolean;
      }>;
      furcations: Array<{ surface: string; siteIndex: number; grade: string }>;
    }>;
  };
  diagnosis: null | {
    id: string;
    extent: string | null;
    complexity: unknown;
    updatedAt: string;
  };
  xray: null | {
    id: string;
    status: string;
    savedAt: string | null;
    updatedAt: string;
    objects: ExportXrayObject[];
    assets: Array<{
      id: string;
      storagePath: string;
      fileName: string;
      mimeType: string;
      fileSize: number;
      naturalWidth: number;
      naturalHeight: number;
      status: string;
      updatedAt: string;
    }>;
  };
};

export type SectionAvailability = Record<
  ExportSectionName,
  { available: boolean; reason: string | null }
>;

const decimalToNumber = (value: Prisma.Decimal | null) =>
  value === null ? null : value.toNumber();

const dateOnly = (date: Date) => date.toISOString().slice(0, 10);

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
};

export const computeSnapshotVersion = (snapshot: Omit<ExportSnapshot, "snapshotVersion">) =>
  createHash("sha256").update(stableStringify(snapshot)).digest("base64url");

export const loadExportSnapshot = async (
  visitId: string,
  userId: string,
  signal: AbortSignal
): Promise<ExportSnapshot> => {
  throwIfAborted(signal);

  const record = await prisma.$transaction(
    (tx) =>
      tx.visits.findFirst({
        where: {
          visit_id: visitId,
          dentist_user_id: userId,
          patient: { is_deleted: false },
        },
        include: {
          patient: true,
          periodontal_charts: {
            where: { is_active: true },
            orderBy: { updated_at: "desc" },
            take: 1,
            include: {
              summary: true,
              teeth: {
                orderBy: { tooth_number: "asc" },
                include: {
                  surfaces: { orderBy: { surface: "asc" } },
                  sites: { orderBy: [{ surface: "asc" }, { site_position: "asc" }] },
                  furcations: { orderBy: [{ surface: "asc" }, { site_index: "asc" }] },
                },
              },
            },
          },
          diagnosis: true,
          xray_board: true,
          xray_assets: {
            where: { status: "active" },
            orderBy: { asset_id: "asc" },
          },
        },
      }),
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
  );

  throwIfAborted(signal);
  if (!record) {
    throw new ExportError(404, "VISIT_NOT_FOUND", "Visit not found");
  }

  const chart = record.periodontal_charts[0] ?? null;
  const parsedCanvas = record.xray_board
    ? canvasSchema.safeParse(record.xray_board.canvas_data)
    : null;
  if (parsedCanvas && !parsedCanvas.success) {
    throw new ExportError(
      422,
      "EXPORT_DATA_UNAVAILABLE",
      "The saved image board cannot be exported",
      { section: "images", reason: "invalid_saved_board" }
    );
  }

  const withoutVersion: Omit<ExportSnapshot, "snapshotVersion"> = {
    patient: {
      id: record.patient.patient_id,
      hn: record.patient.hn,
      firstName: record.patient.first_name,
      lastName: record.patient.last_name,
      age: record.patient.age,
      gender: record.patient.gender,
      nationality: record.patient.nationality,
      note: record.patient.note,
      updatedAt: record.patient.updated_at.toISOString(),
    },
    visit: {
      id: record.visit_id,
      date: dateOnly(record.visit_date),
      phase: record.phase,
      doctorName: record.doctor_name,
      studentId: record.student_id === null ? null : String(record.student_id),
      clinicalNote: record.clinical_note,
      status: record.status,
      updatedAt: record.updated_at.toISOString(),
    },
    chart: chart
      ? {
          id: chart.chart_id,
          name: chart.chart_name,
          status: chart.status,
          updatedAt: chart.updated_at.toISOString(),
          summary: chart.summary
            ? {
                totalTeeth: chart.summary.total_teeth,
                bopPercentage: decimalToNumber(chart.summary.bop_percentage),
                plaquePercentage: decimalToNumber(chart.summary.plaque_percentage),
              }
            : null,
          teeth: chart.teeth.map((tooth) => ({
            number: tooth.tooth_number,
            arch: tooth.arch,
            status: tooth.status,
            mobility: tooth.mobility,
            prognosisKc: tooth.prognosis_kc,
            prognosisMn: tooth.prognosis_mn,
            note: tooth.tooth_note,
            surfaces: tooth.surfaces.map((surface) => ({
              surface: surface.surface,
              ktwMm: decimalToNumber(surface.ktw_mm),
            })),
            sites: tooth.sites.map((site) => ({
              surface: site.surface,
              position: site.site_position,
              pdMm: site.pd_mm,
              recessionMm: site.recession_mm,
              calMm: site.cal_mm,
              bop: site.bop,
              plaque: site.plaque,
            })),
            furcations: tooth.furcations.map((furcation) => ({
              surface: furcation.surface,
              siteIndex: furcation.site_index,
              grade: furcation.grade,
            })),
          })),
        }
      : null,
    diagnosis: record.diagnosis
      ? {
          id: record.diagnosis.diagnosis_id,
          extent: record.diagnosis.extent,
          complexity: record.diagnosis.complexity,
          updatedAt: record.diagnosis.updated_at.toISOString(),
        }
      : null,
    xray: record.xray_board
      ? {
          id: record.xray_board.board_id,
          status: record.xray_board.status,
          savedAt: record.xray_board.saved_at?.toISOString() ?? null,
          updatedAt: record.xray_board.updated_at.toISOString(),
          objects: parsedCanvas?.success
            ? [...parsedCanvas.data.elements].sort(
                (left, right) => left.zIndex - right.zIndex || left.id.localeCompare(right.id)
              )
            : [],
          assets: record.xray_assets.map((asset) => ({
            id: asset.asset_id,
            storagePath: asset.storage_path,
            fileName: asset.file_name,
            mimeType: asset.mime_type,
            fileSize: asset.file_size,
            naturalWidth: asset.natural_width,
            naturalHeight: asset.natural_height,
            status: asset.status,
            updatedAt: asset.updated_at.toISOString(),
          })),
        }
      : null,
  };

  const sourceBytes = withoutVersion.xray?.assets.reduce(
    (total, asset) => total + asset.fileSize,
    0
  ) ?? 0;
  if ((withoutVersion.xray?.assets.length ?? 0) > env.EXPORT_MAX_ASSETS) {
    throw new ExportError(422, "EXPORT_LIMIT_EXCEEDED", "Too many image assets", {
      limit: env.EXPORT_MAX_ASSETS,
    });
  }
  if (sourceBytes > env.EXPORT_MAX_SOURCE_BYTES) {
    throw new ExportError(422, "EXPORT_LIMIT_EXCEEDED", "Image assets are too large", {
      limitBytes: env.EXPORT_MAX_SOURCE_BYTES,
    });
  }

  return { ...withoutVersion, snapshotVersion: computeSnapshotVersion(withoutVersion) };
};

export const getSectionAvailability = (snapshot: ExportSnapshot): SectionAvailability => {
  const hasToothNotes = snapshot.chart?.teeth.some((tooth) => Boolean(tooth.note?.trim())) ?? false;
  const xrayObjects = snapshot.xray?.objects ?? [];
  const hasXrayImages = xrayObjects.some((object) => object.objectType === "image");
  const hasXrayNotes = xrayObjects.some(
    (object) => object.objectType === "note" && Boolean(object.noteText?.trim())
  );

  return {
    chart: {
      available: Boolean(snapshot.chart?.teeth.length),
      reason: snapshot.chart?.teeth.length ? null : "No saved periodontal chart",
    },
    diagnosis: {
      available: Boolean(snapshot.diagnosis),
      reason: snapshot.diagnosis ? null : "No saved diagnosis",
    },
    images: {
      available: hasXrayImages,
      reason: hasXrayImages ? null : "No saved images",
    },
    imageNotes: {
      available: hasXrayNotes,
      reason: hasXrayNotes ? null : "No saved image notes",
    },
    notes: {
      available: Boolean(
        snapshot.patient.note?.trim() || snapshot.visit.clinicalNote?.trim() || hasToothNotes
      ),
      reason:
        snapshot.patient.note?.trim() || snapshot.visit.clinicalNote?.trim() || hasToothNotes
          ? null
          : "No saved clinical notes",
    },
  };
};

export const assertSectionsAvailable = (
  snapshot: ExportSnapshot,
  sections: ExportSectionName[]
) => {
  const availability = getSectionAvailability(snapshot);
  const unavailable = sections
    .filter((section) => !availability[section].available)
    .map((section) => ({ section, reason: availability[section].reason }));
  if (unavailable.length > 0) {
    throw new ExportError(
      422,
      "EXPORT_DATA_UNAVAILABLE",
      "One or more selected sections are unavailable",
      { unavailable }
    );
  }
};
