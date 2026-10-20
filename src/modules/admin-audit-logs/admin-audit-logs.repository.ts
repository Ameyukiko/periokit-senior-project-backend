import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import type { AdminAuditLogListInput } from "./admin-audit-logs.validation";

export const listAdminAuditLogs = async (
  input: AdminAuditLogListInput
) => {
  const where: Prisma.admin_user_audit_logsWhereInput = {
    action: input.action,
    actor_user_id: input.actorUserId,
    target_user_id: input.targetUserId,
    created_at:
      input.from || input.to
        ? { gte: input.from, lte: input.to }
        : undefined,
    OR: input.search
      ? [
          { request_id: { contains: input.search, mode: "insensitive" } },
          { actor: { first_name: { contains: input.search, mode: "insensitive" } } },
          { actor: { last_name: { contains: input.search, mode: "insensitive" } } },
          { actor: { email: { contains: input.search, mode: "insensitive" } } },
          { target: { first_name: { contains: input.search, mode: "insensitive" } } },
          { target: { last_name: { contains: input.search, mode: "insensitive" } } },
          { target: { email: { contains: input.search, mode: "insensitive" } } },
        ]
      : undefined,
  };
  const offset = (input.page - 1) * input.pageSize;
  const [logs, total] = await prisma.$transaction([
    prisma.admin_user_audit_logs.findMany({
      where,
      include: {
        actor: {
          select: {
            user_id: true,
            first_name: true,
            last_name: true,
            email: true,
          },
        },
        target: {
          select: {
            user_id: true,
            first_name: true,
            last_name: true,
            email: true,
          },
        },
      },
      orderBy: [{ created_at: input.sortDirection }, { audit_id: input.sortDirection }],
      skip: offset,
      take: input.pageSize,
    }),
    prisma.admin_user_audit_logs.count({ where }),
  ]);

  return {
    logs,
    total,
    page: input.page,
    pageSize: input.pageSize,
    totalPages: Math.ceil(total / input.pageSize),
  };
};
