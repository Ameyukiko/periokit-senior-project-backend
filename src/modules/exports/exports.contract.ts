import { z } from "zod";

export const EXPORT_SECTION_NAMES = [
  "chart",
  "diagnosis",
  "images",
  "imageNotes",
  "notes",
] as const;

export const EXPORT_PAGE_NAMES = ["patientDetails", ...EXPORT_SECTION_NAMES] as const;

export type ExportSectionName = (typeof EXPORT_SECTION_NAMES)[number];
export type ExportPageName = (typeof EXPORT_PAGE_NAMES)[number];
export type ExportFormat = "pdf" | "png" | "excel";
export type PaperSize = "a4" | "letter" | "legal";
export type PageOrientation = "portrait" | "landscape";

export const PAPER_DIMENSIONS_MM: Record<PaperSize, { width: number; height: number }> = {
  a4: { width: 210, height: 297 },
  letter: { width: 215.9, height: 279.4 },
  legal: { width: 215.9, height: 355.6 },
};

const sectionSchema = z.enum(EXPORT_SECTION_NAMES);
const orientationSchema = z.enum(["portrait", "landscape"]);

const sanitizeBaseFilename = (value: string) => {
  const sanitized = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 80);
  return sanitized || "periodontal-report";
};

const requestSchema = z
  .object({
    format: z.enum(["pdf", "png", "excel"]),
    sections: z
      .array(sectionSchema)
      .min(1, "Select at least one export section")
      .max(EXPORT_SECTION_NAMES.length)
      .refine((sections) => new Set(sections).size === sections.length, {
        message: "Export sections must be unique",
      }),
    paperSize: z.enum(["a4", "letter", "legal"]).default("a4"),
    orientations: z
      .partialRecord(z.enum(EXPORT_PAGE_NAMES), orientationSchema)
      .default({}),
    grayscale: z.boolean().default(false),
    pngDpi: z.union([z.literal(96), z.literal(150), z.literal(300)]).optional(),
    baseFilename: z.string().max(160).default("periodontal-report").transform(sanitizeBaseFilename),
  })
  .superRefine((request, context) => {
    if (request.format === "png" && request.pngDpi === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pngDpi"],
        message: "pngDpi is required for PNG exports",
      });
    }
    if (request.format !== "png" && request.pngDpi !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pngDpi"],
        message: "pngDpi is only valid for PNG exports",
      });
    }
  });

export const previewExportRequestSchema = requestSchema;

export const createExportRequestSchema = requestSchema.and(
  z.object({
    expectedSnapshotVersion: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/, "Invalid snapshot version"),
  })
);

export const visitIdParamSchema = z.object({ visitId: z.string().uuid() });

export type PreviewExportRequest = z.infer<typeof previewExportRequestSchema>;
export type CreateExportRequest = z.infer<typeof createExportRequestSchema>;

export const defaultOrientation = (page: ExportPageName): PageOrientation =>
  page === "chart" || page === "images" ? "landscape" : "portrait";

export const pageDimensions = (
  paperSize: PaperSize,
  orientation: PageOrientation
) => {
  const dimensions = PAPER_DIMENSIONS_MM[paperSize];
  return orientation === "portrait"
    ? dimensions
    : { width: dimensions.height, height: dimensions.width };
};
