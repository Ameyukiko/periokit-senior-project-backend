import { describe, expect, it } from "vitest";
import { user_role } from "@prisma/client";
import {
  assertCanChangeLifecycle,
  assertCanChangeRole,
  assertCanEditProfile,
  assertCanViewAdminUsers,
} from "../modules/admin-users/admin-users.permissions";
import { AdminUserError } from "../modules/admin-users/admin-users.errors";
import { assertLifecycleState } from "../modules/admin-users/admin-users.service";

const errorCode = (run: () => void) => {
  try { run(); } catch (error) { return (error as AdminUserError).code; }
  return null;
};

describe("admin user permission matrix", () => {
  it("allows admin and super admin to view the dashboard", () => {
    expect(() => assertCanViewAdminUsers(user_role.admin)).not.toThrow();
    expect(() => assertCanViewAdminUsers(user_role.super_admin)).not.toThrow();
    expect(errorCode(() => assertCanViewAdminUsers(user_role.dentist))).toBe("ADMIN_USER_FORBIDDEN");
  });

  it("allows a normal admin to edit dentists only", () => {
    expect(() => assertCanEditProfile("admin-1", user_role.admin, "dentist-1", user_role.dentist)).not.toThrow();
    expect(errorCode(() => assertCanEditProfile("admin-1", user_role.admin, "admin-2", user_role.admin))).toBe("ADMIN_USER_FORBIDDEN");
    expect(errorCode(() => assertCanEditProfile("admin-1", user_role.admin, "super-1", user_role.super_admin))).toBe("ADMIN_USER_FORBIDDEN");
  });

  it("allows privileged users to edit their own non-role profile fields", () => {
    expect(() => assertCanEditProfile("admin-1", user_role.admin, "admin-1", user_role.admin)).not.toThrow();
    expect(() => assertCanEditProfile("super-1", user_role.super_admin, "super-1", user_role.super_admin)).not.toThrow();
  });

  it("only allows a super admin to change another user's role", () => {
    expect(() => assertCanChangeRole("super-1", user_role.super_admin, "admin-1")).not.toThrow();
    expect(errorCode(() => assertCanChangeRole("admin-1", user_role.admin, "dentist-1"))).toBe("ROLE_CHANGE_FORBIDDEN");
    expect(errorCode(() => assertCanChangeRole("super-1", user_role.super_admin, "super-1"))).toBe("SELF_ROLE_CHANGE_FORBIDDEN");
  });

  it("prevents self lifecycle changes and protects privileged targets from normal admins", () => {
    expect(errorCode(() => assertCanChangeLifecycle("admin-1", user_role.admin, "admin-1", user_role.admin))).toBe("SELF_LIFECYCLE_CHANGE_FORBIDDEN");
    expect(errorCode(() => assertCanChangeLifecycle("admin-1", user_role.admin, "admin-2", user_role.admin))).toBe("ADMIN_USER_FORBIDDEN");
    expect(() => assertCanChangeLifecycle("super-1", user_role.super_admin, "admin-1", user_role.admin)).not.toThrow();
  });
});

describe("admin user lifecycle states", () => {
  const target = { is_active: true, is_deleted: false } as any;

  it("only permits state transitions from their expected source state", () => {
    expect(() => assertLifecycleState(target, "deactivate")).not.toThrow();
    expect(errorCode(() => assertLifecycleState(target, "reactivate"))).toBe("ADMIN_USER_STATE_CONFLICT");
    expect(() => assertLifecycleState(target, "delete")).not.toThrow();
    expect(errorCode(() => assertLifecycleState(target, "restore"))).toBe("ADMIN_USER_STATE_CONFLICT");
  });

  it("requires restore before a deleted account can be activated", () => {
    const deleted = { is_active: false, is_deleted: true } as any;
    expect(errorCode(() => assertLifecycleState(deleted, "reactivate"))).toBe("ADMIN_USER_STATE_CONFLICT");
    expect(() => assertLifecycleState(deleted, "restore")).not.toThrow();
  });
});
