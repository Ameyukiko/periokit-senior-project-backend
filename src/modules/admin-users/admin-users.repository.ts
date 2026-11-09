import {
  Prisma,
  admin_user_audit_action,
  public_users,
  user_role,
} from "@prisma/client";
import { prisma } from "../../lib/prisma";
import type { AdminUserListInput, UpdateAdminUserInput } from "./admin-users.validation";
import { ADMIN_USER_ERRORS } from "./admin-users.errors";

type AdminUserRow = public_users & { last_sign_in_at: Date | null };
type CountRow = { count: bigint };
type StatusCountRow = { status: string; count: bigint };

const buildWhere = (input: AdminUserListInput) => {
  const clauses: Prisma.Sql[] = [];
  if (input.status === "active") clauses.push(Prisma.sql`u.is_deleted = false AND u.is_active = true`);
  else if (input.status === "deactivated") clauses.push(Prisma.sql`u.is_deleted = false AND u.is_active = false`);
  else if (input.status === "deleted") clauses.push(Prisma.sql`u.is_deleted = true`);
  else clauses.push(Prisma.sql`u.is_deleted = false`);

  if (input.role) clauses.push(Prisma.sql`u.role = ${input.role}::public.user_role`);
  if (input.search) {
    const term = `%${input.search}%`;
    clauses.push(Prisma.sql`(
      u.first_name ILIKE ${term} OR u.last_name ILIKE ${term} OR
      concat_ws(' ', u.first_name, u.last_name) ILIKE ${term} OR
      u.email ILIKE ${term} OR coalesce(u.student_id::text, '') ILIKE ${term}
    )`);
  }
  if (input.lastSignIn === "never") clauses.push(Prisma.sql`a.last_sign_in_at IS NULL`);
  else if (input.lastSignIn === "last_7_days") clauses.push(Prisma.sql`a.last_sign_in_at >= now() - interval '7 days'`);
  else if (input.lastSignIn === "over_30_days") clauses.push(Prisma.sql`a.last_sign_in_at < now() - interval '30 days'`);

  return Prisma.sql`WHERE ${Prisma.join(clauses, " AND ")}`;
};

const orderColumns = {
  studentId: Prisma.raw("u.student_id"),
  createdAt: Prisma.raw("u.created_at"),
  lastSignIn: Prisma.raw("a.last_sign_in_at"),
} as const;

export const listAdminUsers = async (input: AdminUserListInput) => {
  const where = buildWhere(input);
  const direction = input.sortDirection === "asc" ? Prisma.raw("ASC") : Prisma.raw("DESC");
  const offset = (input.page - 1) * input.pageSize;
  const [rows, countRows, statusRows] = await prisma.$transaction([
    prisma.$queryRaw<AdminUserRow[]>(Prisma.sql`
      SELECT u.*, a.last_sign_in_at
      FROM public.users u JOIN auth.users a ON a.id = u.user_id
      ${where}
      ORDER BY ${orderColumns[input.sortBy]} ${direction} NULLS LAST, u.user_id ASC
      LIMIT ${input.pageSize} OFFSET ${offset}
    `),
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT count(*)::bigint AS count
      FROM public.users u JOIN auth.users a ON a.id = u.user_id ${where}
    `),
    prisma.$queryRaw<StatusCountRow[]>(Prisma.sql`
      SELECT CASE WHEN is_deleted THEN 'deleted' WHEN is_active THEN 'active' ELSE 'deactivated' END AS status,
             count(*)::bigint AS count
      FROM public.users GROUP BY 1
    `),
  ]);
  const counts = { all: 0, active: 0, deactivated: 0, deleted: 0 };
  for (const row of statusRows) counts[row.status as keyof typeof counts] = Number(row.count);
  counts.all = counts.active + counts.deactivated;
  const total = Number(countRows[0]?.count ?? 0);
  return { rows, total, counts, page: input.page, pageSize: input.pageSize, totalPages: Math.ceil(total / input.pageSize) };
};

export const findAdminUser = (userId: string) => prisma.public_users.findUnique({
  where: { user_id: userId },
  include: { users: { select: { last_sign_in_at: true } } },
});

export const lockPrivilegedMutations = (tx: Prisma.TransactionClient) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('periokit:last-active-super-admin'))`;

export const requireAdminUserInTransaction = async (tx: Prisma.TransactionClient, userId: string) => {
  const user = await tx.public_users.findUnique({ where: { user_id: userId } });
  if (!user) throw ADMIN_USER_ERRORS.notFound();
  return user;
};

export const writeAudit = (
  tx: Prisma.TransactionClient,
  actor: public_users,
  before: public_users,
  after: public_users,
  action: admin_user_audit_action,
  requestId?: string
) => {
  const snapshot = (user: public_users): Prisma.InputJsonValue => ({
    userId: user.user_id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    studentId: user.student_id,
    role: user.role,
    isActive: user.is_active,
    isDeleted: user.is_deleted,
    deletedAt: user.deleted_at?.toISOString() ?? null,
  });
  return tx.admin_user_audit_logs.create({ data: {
    actor_user_id: actor.user_id,
    actor_role: actor.role,
    target_user_id: before.user_id,
    target_role_before: before.role,
    target_role_after: after.role,
    action,
    before_data: snapshot(before),
    after_data: snapshot(after),
    request_id: requestId,
  } });
};

export const updateAdminUserRecord = (
  tx: Prisma.TransactionClient,
  userId: string,
  input: UpdateAdminUserInput,
  actorId: string
) => tx.public_users.update({ where: { user_id: userId }, data: {
  first_name: input.firstName,
  last_name: input.lastName,
  student_id: input.studentId,
  role: input.role,
  updated_by: actorId,
  updated_at: new Date(),
} });
