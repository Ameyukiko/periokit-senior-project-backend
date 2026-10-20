import { Request, Response } from "express";
import { ZodError } from "zod";
import { AdminUserError } from "../admin-users/admin-users.errors";
import { getAdminAuditLogs } from "./admin-audit-logs.service";
import { adminAuditLogListSchema } from "./admin-audit-logs.validation";

export const listAuditLogs = async (req: Request, res: Response) => {
  const validation = adminAuditLogListSchema.safeParse(req.query);
  if (!validation.success) {
    const error: ZodError = validation.error;
    res.status(400).json({
      success: false,
      reason: "VALIDATION_ERROR",
      message: "Validation failed",
      errors: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  try {
    if (!req.auth) {
      throw new AdminUserError(
        "UNAUTHENTICATED",
        "Authentication context is missing",
        401
      );
    }
    const data = await getAdminAuditLogs(req.auth.profile, validation.data);
    res.json({ success: true, data });
  } catch (error) {
    if (error instanceof AdminUserError) {
      res.status(error.statusCode).json({
        success: false,
        reason: error.code,
        message: error.message,
      });
      return;
    }
    console.error("Admin audit log request failed", error);
    res.status(500).json({
      success: false,
      reason: "INTERNAL_ERROR",
      message: "Failed to retrieve admin audit logs",
    });
  }
};
