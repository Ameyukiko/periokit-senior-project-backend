import { randomUUID } from "crypto";
import { Request, Response } from "express";
import { ZodError, ZodType } from "zod";
import { AdminUserError } from "./admin-users.errors";
import {
  changeAdminUserLifecycle,
  getAdminUser,
  getAdminUsers,
  updateAdminUser,
} from "./admin-users.service";
import {
  adminUserIdSchema,
  adminUserListSchema,
  updateAdminUserSchema,
} from "./admin-users.validation";

const validationErrors = (error: ZodError) =>
  error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
const parse = <T>(schema: ZodType<T>, value: unknown) => {
  const result = schema.safeParse(value);
  if (!result.success) throw result.error;
  return result.data;
};
const requestId = (req: Request) =>
  typeof req.headers["x-request-id"] === "string"
    ? req.headers["x-request-id"].slice(0, 100)
    : randomUUID();

const respondError = (res: Response, error: unknown) => {
  if (error instanceof ZodError) {
    return res.status(400).json({
      success: false,
      reason: "VALIDATION_ERROR",
      message: "Validation failed",
      errors: validationErrors(error),
    });
  }
  if (error instanceof AdminUserError) {
    return res.status(error.statusCode).json({
      success: false,
      reason: error.code,
      message: error.message,
    });
  }
  console.error("Admin users request failed", error);
  return res.status(500).json({
    success: false,
    reason: "INTERNAL_ERROR",
    message: "Failed to process admin user request",
  });
};

const actor = (req: Request) => {
  if (!req.auth) throw new AdminUserError("UNAUTHENTICATED", "Authentication context is missing", 401);
  return req.auth.profile;
};

export const listUsers = async (req: Request, res: Response) => {
  try {
    const data = await getAdminUsers(
      actor(req),
      parse(adminUserListSchema, req.query)
    );
    res.json({ success: true, data });
  } catch (error) {
    respondError(res, error);
  }
};
export const showUser = async (req: Request, res: Response) => {
  try {
    const { userId } = parse(adminUserIdSchema, req.params);
    res.json({ success: true, data: await getAdminUser(actor(req), userId) });
  } catch (error) {
    respondError(res, error);
  }
};
export const patchUser = async (req: Request, res: Response) => {
  try {
    const { userId } = parse(adminUserIdSchema, req.params);
    const data = await updateAdminUser(
      actor(req),
      userId,
      parse(updateAdminUserSchema, req.body),
      requestId(req)
    );
    res.json({ success: true, data });
  } catch (error) {
    respondError(res, error);
  }
};
export const lifecycle = (
  action: "deactivate" | "reactivate" | "delete" | "restore"
) => async (req: Request, res: Response) => {
  try {
    const { userId } = parse(adminUserIdSchema, req.params);
    const data = await changeAdminUserLifecycle(
      actor(req),
      userId,
      action,
      requestId(req)
    );
    res.json({ success: true, data });
  } catch (error) {
    respondError(res, error);
  }
};
