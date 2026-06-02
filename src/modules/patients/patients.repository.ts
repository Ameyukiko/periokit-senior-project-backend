import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";

export const patientsRepository = {
  findAll: async (
    ownerUserId: string,
    opts: {
      search?: string;
      dateFrom?: string;
      dateTo?: string;
      page?: number;
      pageSize?: number;
    }
  ) => {
    const { search, dateFrom, dateTo, page = 1, pageSize = 10 } = opts;
    const skip = (page - 1) * pageSize;

    const where: Prisma.patientsWhereInput = {
      owner_user_id: ownerUserId,
      is_deleted: false,
      ...(search && {
        OR: [
          { first_name: { contains: search, mode: "insensitive" } },
          { last_name:  { contains: search, mode: "insensitive" } },
          { hn:         { contains: search, mode: "insensitive" } },
        ],
      }),
      ...((dateFrom || dateTo) && {
        visits: {
          some: {
            visit_date: {
              ...(dateFrom && { gte: new Date(dateFrom) }),
              ...(dateTo   && { lte: new Date(dateTo) }),
            },
          },
        },
      }),
    };

    const [items, total] = await Promise.all([
      prisma.patients.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: "desc" },
        include: {
          visits: {
            orderBy: { visit_date: "desc" },
            take: 1,
            select: { visit_date: true },
          },
        },
      }),
      prisma.patients.count({ where }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  },

  findById: (patientId: string, ownerUserId: string) =>
    prisma.patients.findFirst({
      where: {
        patient_id: patientId,
        owner_user_id: ownerUserId,
        is_deleted: false,
      },
      include: {
        _count: { select: { visits: true } },
      },
    }),
};
