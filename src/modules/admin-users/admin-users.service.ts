import {
  admin_user_audit_action,
  Prisma,
  public_users,
  user_role,
} from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { supabaseAdmin } from "../../lib/supabase";
import { ADMIN_USER_ERRORS, AdminUserError } from "./admin-users.errors";
import {
  findAdminUser,
  listAdminUsers,
  lockPrivilegedMutations,
  requireAdminUserInTransaction,
  updateAdminUserRecord,
  writeAudit,
} from "./admin-users.repository";
import {
  assertCanChangeLifecycle,
  assertCanChangeRole,
  assertCanEditProfile,
  assertCanViewAdminUsers,
} from "./admin-users.permissions";
import type { AdminUserListInput, UpdateAdminUserInput } from "./admin-users.validation";

type UserWithLastSignIn = public_users & {
  last_sign_in_at?: Date | null;
  users?: { last_sign_in_at: Date | null };
};

const serializeUser = (user: UserWithLastSignIn) => ({
  userId: user.user_id,
  email: user.email,
  firstName: user.first_name,
  lastName: user.last_name,
  studentId: user.student_id,
  role: user.role,
  isActive: user.is_active,
  isDeleted: user.is_deleted,
  deletedAt: user.deleted_at,
  createdAt: user.created_at,
  updatedAt: user.updated_at,
  lastSignInAt: user.last_sign_in_at ?? user.users?.last_sign_in_at ?? null,
});

const assertActorIsEnabled = (actor: public_users) => {
  if (actor.is_deleted || !actor.is_active) throw ADMIN_USER_ERRORS.forbidden();
  assertCanViewAdminUsers(actor.role);
};

export const getAdminUsers = async (actor: public_users, input: AdminUserListInput) => {
  assertCanViewAdminUsers(actor.role);
  const result = await listAdminUsers(input);
  return { ...result, users: result.rows.map(serializeUser), rows: undefined };
};

export const getAdminUser = async (actor: public_users, userId: string) => {
  assertCanViewAdminUsers(actor.role);
  const target = await findAdminUser(userId);
  if (!target) throw ADMIN_USER_ERRORS.notFound();
  return serializeUser(target);
};

const assertNotLastActiveSuperAdmin = async (
  tx: Prisma.TransactionClient,
  target: public_users,
  removesActiveSuperAdmin: boolean
) => {
  if (!removesActiveSuperAdmin || target.role !== user_role.super_admin || !target.is_active || target.is_deleted) return;
  const activeSuperAdmins = await tx.public_users.count({
    where: { role: user_role.super_admin, is_active: true, is_deleted: false },
  });
  if (activeSuperAdmins <= 1) throw ADMIN_USER_ERRORS.lastSuperAdmin();
};

export const updateAdminUser = async (
  actor: public_users,
  targetId: string,
  input: UpdateAdminUserInput,
  requestId?: string
) => prisma.$transaction(async (tx) => {
  await lockPrivilegedMutations(tx);
  const currentActor = await requireAdminUserInTransaction(tx, actor.user_id);
  assertActorIsEnabled(currentActor);
  const target = await requireAdminUserInTransaction(tx, targetId);
  if (target.is_deleted) throw ADMIN_USER_ERRORS.conflict("Restore the user before editing their profile");
  if (input.role !== undefined) {
    assertCanChangeRole(currentActor.user_id, currentActor.role, target.user_id);
    await assertNotLastActiveSuperAdmin(tx, target, input.role !== user_role.super_admin);
  }
  const hasProfileChanges = input.firstName !== undefined || input.lastName !== undefined || input.studentId !== undefined;
  if (hasProfileChanges) assertCanEditProfile(currentActor.user_id, currentActor.role, target.user_id, target.role);
  const updated = await updateAdminUserRecord(tx, targetId, input, currentActor.user_id);
  const action = input.role !== undefined && input.role !== target.role
    ? admin_user_audit_action.role_changed
    : admin_user_audit_action.profile_updated;
  await writeAudit(tx, currentActor, target, updated, action, requestId);
  return serializeUser(updated);
});

type LifecycleAction = "deactivate" | "reactivate" | "delete" | "restore";

const lifecycleAuditActions: Record<LifecycleAction, admin_user_audit_action> = {
  deactivate: admin_user_audit_action.deactivated,
  reactivate: admin_user_audit_action.reactivated,
  delete: admin_user_audit_action.deleted,
  restore: admin_user_audit_action.restored,
};

export const assertLifecycleState = (target: public_users, action: LifecycleAction) => {
  if (action === "deactivate" && (target.is_deleted || !target.is_active)) throw ADMIN_USER_ERRORS.conflict("User is not active");
  if (action === "reactivate" && (target.is_deleted || target.is_active)) throw ADMIN_USER_ERRORS.conflict("User is not deactivated");
  if (action === "delete" && target.is_deleted) throw ADMIN_USER_ERRORS.conflict("User is already deleted");
  if (action === "restore" && !target.is_deleted) throw ADMIN_USER_ERRORS.conflict("User is not deleted");
};

const setProviderBan = async (userId: string, banned: boolean) => {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    ban_duration: banned ? "876000h" : "none",
  });
  if (error) throw ADMIN_USER_ERRORS.provider();
};

export const changeAdminUserLifecycle = async (
  actor: public_users,
  targetId: string,
  action: LifecycleAction,
  requestId?: string
) => {
  let providerChanged = false;
  let providerShouldBeBanned = false;

  try {
    return await prisma.$transaction(async (tx) => {
      await lockPrivilegedMutations(tx);
      const currentActor = await requireAdminUserInTransaction(tx, actor.user_id);
      assertActorIsEnabled(currentActor);
      const target = await requireAdminUserInTransaction(tx, targetId);
      assertCanChangeLifecycle(currentActor.user_id, currentActor.role, target.user_id, target.role);
      assertLifecycleState(target, action);
      await assertNotLastActiveSuperAdmin(tx, target, action === "deactivate" || action === "delete");

      const shouldChangeProvider =
        action === "deactivate" ||
        action === "reactivate" ||
        (action === "delete" && target.is_active);
      providerShouldBeBanned = action !== "reactivate";
      if (shouldChangeProvider) {
        await setProviderBan(targetId, providerShouldBeBanned);
        providerChanged = true;
      }

      const now = new Date();
      const data: Prisma.public_usersUpdateInput = action === "deactivate"
        ? { is_active: false }
        : action === "reactivate"
          ? { is_active: true }
          : action === "delete"
            ? { is_active: false, is_deleted: true, deleted_at: now, deleted_by_user: { connect: { user_id: currentActor.user_id } } }
            : { is_active: false, is_deleted: false, deleted_at: null, deleted_by_user: { disconnect: true } };
      const updated = await tx.public_users.update({
        where: { user_id: targetId },
        data: { ...data, updated_by_user: { connect: { user_id: currentActor.user_id } }, updated_at: now },
      });
      await writeAudit(tx, currentActor, target, updated, lifecycleAuditActions[action], requestId);
      return serializeUser(updated);
    });
  } catch (error) {
    if (providerChanged) {
      try {
        await setProviderBan(targetId, !providerShouldBeBanned);
      } catch (compensationError) {
        console.error("Failed to compensate Supabase user lifecycle state", {
          targetId,
          compensationError,
        });
      }
    }
    if (error instanceof AdminUserError) throw error;
    throw error;
  }
};
