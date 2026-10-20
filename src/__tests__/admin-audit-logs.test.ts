import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { user_role } from "@prisma/client";
import { requireSuperAdmin } from "../modules/admin-users/admin-users.middleware";
import { adminAuditLogListSchema } from "../modules/admin-audit-logs/admin-audit-logs.validation";

const { listAdminAuditLogs } = vi.hoisted(() => ({
  listAdminAuditLogs: vi.fn(),
}));
vi.mock("../modules/admin-audit-logs/admin-audit-logs.repository", () => ({
  listAdminAuditLogs,
}));

import { getAdminAuditLogs } from "../modules/admin-audit-logs/admin-audit-logs.service";

const profile = (role: user_role) =>
  ({
    user_id: `${role}-1`,
    role,
    is_active: true,
    is_deleted: false,
  }) as any;

const response = () => {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: any };
};

describe("admin audit log validation", () => {
  it("provides bounded pagination and newest-first defaults", () => {
    expect(adminAuditLogListSchema.parse({})).toMatchObject({
      page: 1,
      pageSize: 25,
      sortDirection: "desc",
    });
  });

  it("accepts supported filters and date ranges", () => {
    const result = adminAuditLogListSchema.safeParse({
      action: "role_changed",
      actorUserId: "419b6d8d-04c5-4bba-a3bc-e20feaec223a",
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-10-20T23:59:59.999Z",
      pageSize: "100",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid actions, reversed dates and oversized pages", () => {
    expect(adminAuditLogListSchema.safeParse({ action: "login" }).success).toBe(false);
    expect(
      adminAuditLogListSchema.safeParse({
        from: "2026-10-21T00:00:00.000Z",
        to: "2026-10-20T00:00:00.000Z",
      }).success
    ).toBe(false);
    expect(adminAuditLogListSchema.safeParse({ pageSize: "101" }).success).toBe(false);
  });
});

describe("super-admin-only audit log access", () => {
  beforeEach(() => listAdminAuditLogs.mockReset());

  it("blocks a normal admin in middleware with a stable reason", () => {
    const req = { auth: { profile: profile(user_role.admin) } } as Request;
    const res = response();
    const next = vi.fn() as NextFunction;
    requireSuperAdmin(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(res.body.reason).toBe("SUPER_ADMIN_REQUIRED");
    expect(next).not.toHaveBeenCalled();
  });

  it("allows a super admin through middleware", () => {
    const req = { auth: { profile: profile(user_role.super_admin) } } as Request;
    const next = vi.fn() as NextFunction;
    requireSuperAdmin(req, response(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("re-checks the role and active state in the service", async () => {
    await expect(
      getAdminAuditLogs(profile(user_role.admin), adminAuditLogListSchema.parse({}))
    ).rejects.toMatchObject({ code: "SUPER_ADMIN_REQUIRED", statusCode: 403 });
    const disabledSuper = { ...profile(user_role.super_admin), is_active: false };
    await expect(
      getAdminAuditLogs(disabledSuper, adminAuditLogListSchema.parse({}))
    ).rejects.toMatchObject({ code: "SUPER_ADMIN_REQUIRED", statusCode: 403 });
    expect(listAdminAuditLogs).not.toHaveBeenCalled();
  });

  it("queries logs for an enabled super admin", async () => {
    listAdminAuditLogs.mockResolvedValue({
      logs: [],
      total: 0,
      page: 1,
      pageSize: 25,
      totalPages: 0,
    });
    const input = adminAuditLogListSchema.parse({});
    await expect(
      getAdminAuditLogs(profile(user_role.super_admin), input)
    ).resolves.toMatchObject({ logs: [], total: 0 });
    expect(listAdminAuditLogs).toHaveBeenCalledWith(input);
  });
});
