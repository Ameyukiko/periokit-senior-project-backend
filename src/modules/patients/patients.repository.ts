import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";

type PatientSortValue =
  | "date_asc"
  | "date_desc"
  | "name_asc"
  | "name_desc";

export const patientsRepository = {
  findAll: async (
    ownerUserId: string,
    opts: {
      search?: string;
      dateFrom?: string;
      dateTo?: string;
      sort?: PatientSortValue;
      page?: number;
      pageSize?: number;
    }
  ) => {
    const {
      search,
      dateFrom,
      dateTo,
      sort = "date_desc",
      page = 1,
      pageSize = 10,
    } = opts;
    const normalizedPage = Math.max(1, page);
    const normalizedPageSize = Math.min(Math.max(1, pageSize), 100);
    const skip = (normalizedPage - 1) * normalizedPageSize;

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

    const orderBy: Prisma.patientsOrderByWithRelationInput[] =
      sort === "name_asc"
        ? [{ first_name: "asc" }, { last_name: "asc" }, { created_at: "desc" }]
        : sort === "name_desc"
          ? [{ first_name: "desc" }, { last_name: "desc" }, { created_at: "desc" }]
          : [{ created_at: "desc" }];

    const [allItems, total] = await Promise.all([
      prisma.patients.findMany({
        where,
        orderBy,
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

    const sortedItems = sort === "date_asc" || sort === "date_desc"
      ? [...allItems].sort((a, b) => {
          const dateA = a.visits[0]?.visit_date?.getTime() ?? 0;
          const dateB = b.visits[0]?.visit_date?.getTime() ?? 0;
          const cmp = sort === "date_asc" ? dateA - dateB : dateB - dateA;
          return cmp || b.created_at.getTime() - a.created_at.getTime();
        })
      : allItems;

    const items = sortedItems.slice(skip, skip + normalizedPageSize);

    return {
      items,
      total,
      page: normalizedPage,
      pageSize: normalizedPageSize,
      totalPages: Math.ceil(total / normalizedPageSize),
    };
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
        visits: {
          orderBy: { visit_date: "desc" },
          include: {
            periodontal_charts: {
              select: { chart_id: true, status: true },
            },
          },
        },
      },
    }),
};
