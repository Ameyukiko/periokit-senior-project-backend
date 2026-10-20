import { user_role, type public_users } from "@prisma/client";
import { AdminUserError } from "../admin-users/admin-users.errors";
import { listAdminAuditLogs } from "./admin-audit-logs.repository";
import type { AdminAuditLogListInput } from "./admin-audit-logs.validation";

export const getAdminAuditLogs = async (
  actor: public_users,
  input: AdminAuditLogListInput
) => {
  if (
    actor.role !== user_role.super_admin ||
    actor.is_deleted ||
    !actor.is_active
  ) {
    throw new AdminUserError(
      "SUPER_ADMIN_REQUIRED",
      "Super admin access is required",
      403
    );
  }

  const result = await listAdminAuditLogs(input);
  return {
    ...result,
    logs: result.logs.map((log) => ({
      auditId: log.audit_id,
      action: log.action,
      actorRole: log.actor_role,
      targetRoleBefore: log.target_role_before,
      targetRoleAfter: log.target_role_after,
      before: log.before_data,
      after: log.after_data,
      requestId: log.request_id,
      createdAt: log.created_at,
      actor: {
        userId: log.actor.user_id,
        firstName: log.actor.first_name,
        lastName: log.actor.last_name,
        email: log.actor.email,
      },
      target: {
        userId: log.target.user_id,
        firstName: log.target.first_name,
        lastName: log.target.last_name,
        email: log.target.email,
      },
    })),
  };
};
