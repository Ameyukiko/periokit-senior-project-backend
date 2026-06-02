import { prisma } from "../../lib/prisma";

export const findVisitById = (visitId: string) =>
  prisma.visits.findUnique({ where: { visit_id: visitId } });
