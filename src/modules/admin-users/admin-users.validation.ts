import { z } from "zod";

export const adminUserIdSchema = z.object({
  userId: z.string().uuid(),
}).strict();

const optionalTrimmed = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().optional()
);

export const adminUserListSchema = z.object({
  search: optionalTrimmed.pipe(z.string().max(200).optional()),
  role: z.enum(["dentist", "admin", "super_admin"]).optional(),
  status: z.enum(["all", "active", "deactivated", "deleted"]).default("all"),
  lastSignIn: z.enum(["last_7_days", "over_30_days", "never"]).optional(),
  sortBy: z.enum(["studentId", "createdAt", "lastSignIn"]).default("createdAt"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
}).strict();

export const updateAdminUserSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  studentId: z.number().int().positive().nullable().optional(),
  role: z.enum(["dentist", "admin", "super_admin"]).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: "At least one field is required",
});

export type AdminUserListInput = z.infer<typeof adminUserListSchema>;
export type UpdateAdminUserInput = z.infer<typeof updateAdminUserSchema>;
