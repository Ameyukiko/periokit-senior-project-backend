import { prisma } from "../../lib/prisma";

export const visitsRepository = {
  findByPatient: (patientId: string, doctorId: string) =>
    prisma.visits.findMany({
      where: { patient_id: patientId, dentist_user_id: doctorId },
      orderBy: { visit_date: "desc" },
      include: {
        periodontal_charts: {
          select: { chart_id: true, chart_name: true, status: true },
        },
      },
    }),

  findById: (visitId: string) =>
    prisma.visits.findUnique({ where: { visit_id: visitId } }),
};
