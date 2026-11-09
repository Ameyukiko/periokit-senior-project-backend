import { z } from "zod";

const optionalTrimmed = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().optional()
);

const optionalDate = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.coerce.date().optional()
);

export const adminAuditLogListSchema = z
  .object({
    search: optionalTrimmed.pipe(z.string().max(200).optional()),
    action: z
      .enum([
        "profile_updated",
        "role_changed",
        "deactivated",
        "reactivated",
        "deleted",
        "restored",
      ])
      .optional(),
    actorUserId: z.string().uuid().optional(),
    targetUserId: z.string().uuid().optional(),
    from: optionalDate,
    to: optionalDate,
    sortDirection: z.enum(["asc", "desc"]).default("desc"),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict()
  .refine(
    (value) => !value.from || !value.to || value.from <= value.to,
    { message: "from must be before or equal to to", path: ["from"] }
  );

export type AdminAuditLogListInput = z.infer<
  typeof adminAuditLogListSchema
>;
