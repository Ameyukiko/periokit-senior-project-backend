import { NextFunction, Request, Response } from "express";
import { user_role } from "@prisma/client";

export const requireAdminDashboardAccess = (req: Request, res: Response, next: NextFunction) => {
  const role = req.auth?.profile.role;
  if (role !== user_role.admin && role !== user_role.super_admin) {
    res.status(403).json({ success: false, reason: "ADMIN_DASHBOARD_FORBIDDEN", message: "Admin access is required" });
    return;
  }
  next();
};

export const requireSuperAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (req.auth?.profile.role !== user_role.super_admin) {
    res.status(403).json({
      success: false,
      reason: "SUPER_ADMIN_REQUIRED",
      message: "Super admin access is required",
    });
    return;
  }
  next();
};
