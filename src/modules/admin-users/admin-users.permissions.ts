import { user_role } from "@prisma/client";
import { ADMIN_USER_ERRORS } from "./admin-users.errors";

export const isPrivilegedRole = (role: user_role) =>
  role === user_role.admin || role === user_role.super_admin;

export const assertCanViewAdminUsers = (actorRole: user_role) => {
  if (!isPrivilegedRole(actorRole)) throw ADMIN_USER_ERRORS.forbidden();
};

export const assertCanEditProfile = (
  actorId: string,
  actorRole: user_role,
  targetId: string,
  targetRole: user_role
) => {
  assertCanViewAdminUsers(actorRole);
  if (
    actorRole === user_role.admin &&
    actorId !== targetId &&
    targetRole !== user_role.dentist
  ) {
    throw ADMIN_USER_ERRORS.forbidden();
  }
};

export const assertCanChangeRole = (
  actorId: string,
  actorRole: user_role,
  targetId: string
) => {
  if (actorRole !== user_role.super_admin) throw ADMIN_USER_ERRORS.roleForbidden();
  if (actorId === targetId) throw ADMIN_USER_ERRORS.selfRole();
};

export const assertCanChangeLifecycle = (
  actorId: string,
  actorRole: user_role,
  targetId: string,
  targetRole: user_role
) => {
  if (actorId === targetId) throw ADMIN_USER_ERRORS.selfLifecycle();
  assertCanEditProfile(actorId, actorRole, targetId, targetRole);
};
