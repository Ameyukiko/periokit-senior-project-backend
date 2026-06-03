import { GraphQLError } from "graphql";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";

type SitePayload = {
  site_position: string;
  pd_mm: number | null;
  recession_mm: number | null;
  cal_mm: number | null;
  bop: boolean;
  plaque: boolean;
};

type SurfacePayload = {
  surface: string;
  ktw_mm?: number | null;
  sites: SitePayload[];
};

type FurcationPayload = {
  surface: string;
  site_index: number;
  grade: string;
};

type ToothPayload = {
  tooth_number: number;
  tooth_arch: string;
  status: string;
  mobility?: number | null;
  prognosis_kc?: string | null;
  prognosis_mn?: string | null;
  tooth_note?: string | null;
  surfaces: SurfacePayload[];
  furcations: FurcationPayload[];
};

type SummaryPayload = {
  total_teeth?: number | null;
  bop_percentage?: number | null;
  plaque_percentage?: number | null;
};

export type ChartPayload = {
  chart_name?: string | null;
  teeth: ToothPayload[];
  summary?: SummaryPayload | null;
};

export type SaveChartFullInput = {
  visitId?: string | null;
  chartName?: string | null;
  teethData: ChartPayload;
  patientHn: string;
  patientFirstName: string;
  patientLastName: string;
  patientAge?: number | null;
  patientGender?: string | null;
  patientNationality?: string | null;
  visitDate: string;
  visitPhase: string;
};

const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  return Number(v);
};

type ChartWithIncludes = NonNullable<Awaited<ReturnType<typeof chartsRepository.findByVisit>>>;

const buildTeethPayload = (teeth: ChartWithIncludes["teeth"]): ToothPayload[] =>
  teeth.map((tooth) => ({
    tooth_number: tooth.tooth_number,
    tooth_arch: tooth.arch,
    status: tooth.status,
    mobility: tooth.mobility ?? null,
    prognosis_kc: tooth.prognosis_kc ?? null,
    prognosis_mn: tooth.prognosis_mn ?? null,
    tooth_note: tooth.tooth_note ?? null,
    surfaces: tooth.surfaces.map((s) => ({
      surface: s.surface,
      ktw_mm: toNum(s.ktw_mm),
      sites: tooth.sites
        .filter((site) => site.surface === s.surface)
        .map((site) => ({
          site_position: site.site_position,
          pd_mm: toNum(site.pd_mm),
          recession_mm: toNum(site.recession_mm),
          cal_mm: toNum(site.cal_mm),
          bop: site.bop,
          plaque: site.plaque,
        })),
    })),
    furcations: tooth.furcations.map((fur) => ({
      surface: fur.surface,
      site_index: fur.site_index,
      grade: fur.grade,
    })),
  }));

export const mapChartResponse = (
  chart: ChartWithIncludes,
  teethPayload: ToothPayload[]
) => ({
  id: chart.chart_id,
  visitId: chart.visit_id,
  chartName: chart.chart_name ?? null,
  status: chart.status,
  teethData: teethPayload,
  summary: chart.summary
    ? {
        total_teeth: chart.summary.total_teeth ?? null,
        bop_percentage: toNum(chart.summary.bop_percentage),
        plaque_percentage: toNum(chart.summary.plaque_percentage),
      }
    : null,
  updatedAt: chart.updated_at.toISOString(),
  patientInfo: chart.visit?.patient
    ? {
        hn: chart.visit.patient.hn,
        patientName: `${chart.visit.patient.first_name} ${chart.visit.patient.last_name}`.trim(),
        age: chart.visit.patient.age ?? null,
        gender: chart.visit.patient.gender
          ? chart.visit.patient.gender.charAt(0).toUpperCase() + chart.visit.patient.gender.slice(1)
          : null,
        nationality: chart.visit.patient.nationality ?? null,
        date: chart.visit.visit_date.toISOString().split("T")[0],
        visitPhase: chart.visit.phase ?? null,
        doctor: chart.visit.doctor_name ?? null,
        studentId: chart.visit.student_id != null ? String(chart.visit.student_id) : null,
      }
    : null,
});

// ---- helper: upsert chart rows inside a transaction ----
const upsertChartRows = async (
  tx: Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">,
  visitId: string,
  payload: ChartPayload & { chart_name?: string | null }
) => {
  const chart = await tx.periodontal_charts.upsert({
    where: { visit_id: visitId },
    update: { chart_name: payload.chart_name ?? null, status: "saved", updated_at: new Date() },
    create: { visit_id: visitId, chart_name: payload.chart_name ?? null, status: "saved" },
  });

  // Delete cascades to surfaces, sites, furcations via FK onDelete: Cascade
  await tx.periodontal_chart_teeth.deleteMany({ where: { chart_id: chart.chart_id } });

  // Bulk create all teeth in one query and get their generated IDs
  const createdTeeth = await tx.periodontal_chart_teeth.createManyAndReturn({
    data: payload.teeth.map((tooth) => ({
      chart_id: chart.chart_id,
      tooth_number: tooth.tooth_number,
      arch: tooth.tooth_arch as any,
      status: tooth.status as any,
      mobility: tooth.mobility ?? null,
      prognosis_kc: (tooth.prognosis_kc as any) ?? null,
      prognosis_mn: (tooth.prognosis_mn as any) ?? null,
      tooth_note: tooth.tooth_note ?? null,
    })),
    select: { chart_tooth_id: true, tooth_number: true },
  });

  const toothIdMap = new Map(createdTeeth.map((t) => [t.tooth_number, t.chart_tooth_id]));

  const surfacesData: Prisma.periodontal_tooth_surfacesCreateManyInput[] = [];
  const sitesData: Prisma.periodontal_tooth_sitesCreateManyInput[] = [];
  const furcationsData: Prisma.periodontal_tooth_furcationsCreateManyInput[] = [];

  for (const tooth of payload.teeth) {
    const chart_tooth_id = toothIdMap.get(tooth.tooth_number)!;
    for (const surface of tooth.surfaces) {
      surfacesData.push({ chart_tooth_id, surface: surface.surface as any, ktw_mm: surface.ktw_mm ?? null });
      for (const site of surface.sites) {
        sitesData.push({
          chart_tooth_id,
          surface: surface.surface as any,
          site_position: site.site_position as any,
          pd_mm: site.pd_mm ?? null,
          recession_mm: site.recession_mm ?? null,
          cal_mm: site.cal_mm ?? null,
          bop: site.bop,
          plaque: site.plaque,
        });
      }
    }
    for (const fur of tooth.furcations) {
      furcationsData.push({ chart_tooth_id, surface: fur.surface as any, site_index: fur.site_index, grade: fur.grade as any });
    }
  }

  await Promise.all([
    surfacesData.length > 0 ? tx.periodontal_tooth_surfaces.createMany({ data: surfacesData }) : Promise.resolve(),
    sitesData.length > 0 ? tx.periodontal_tooth_sites.createMany({ data: sitesData }) : Promise.resolve(),
    furcationsData.length > 0 ? tx.periodontal_tooth_furcations.createMany({ data: furcationsData }) : Promise.resolve(),
  ]);

  if (payload.summary) {
    await tx.periodontal_chart_summaries.upsert({
      where: { chart_id: chart.chart_id },
      update: {
        total_teeth: payload.summary.total_teeth ?? null,
        bop_percentage: payload.summary.bop_percentage ?? null,
        plaque_percentage: payload.summary.plaque_percentage ?? null,
      },
      create: {
        chart_id: chart.chart_id,
        total_teeth: payload.summary.total_teeth ?? null,
        bop_percentage: payload.summary.bop_percentage ?? null,
        plaque_percentage: payload.summary.plaque_percentage ?? null,
      },
    });
  }

  return chart;
};

export const chartsRepository = {
  findByVisit: (visitId: string) =>
    prisma.periodontal_charts.findUnique({
      where: { visit_id: visitId },
      include: {
        teeth: { include: { surfaces: true, sites: true, furcations: true } },
        summary: true,
        visit: { include: { patient: true } },
      },
    }),

  findByVisitAndMap: async (visitId: string) => {
    const chart = await chartsRepository.findByVisit(visitId);
    if (!chart) return null;
    return mapChartResponse(chart, buildTeethPayload(chart.teeth));
  },

  // Legacy: upsert chart only (used if needed standalone)
  upsertChart: (visitId: string, payload: ChartPayload) =>
    prisma.$transaction((tx) => upsertChartRows(tx, visitId, payload), { timeout: 10000 }),

  // New: upsert patient -> resolve/create visit -> upsert chart, all in one transaction
  saveChartFull: (userId: string, input: SaveChartFullInput): Promise<string> =>
    prisma.$transaction(async (tx) => {
      // 1. Upsert patient by (owner_user_id, hn)
      const patient = await tx.patients.upsert({
        where: { owner_user_id_hn: { owner_user_id: userId, hn: input.patientHn } },
        update: {
          first_name: input.patientFirstName,
          last_name: input.patientLastName,
          age: input.patientAge ?? null,
          gender: (input.patientGender as any) ?? null,
          nationality: input.patientNationality ?? null,
        },
        create: {
          owner_user_id: userId,
          hn: input.patientHn,
          first_name: input.patientFirstName,
          last_name: input.patientLastName,
          age: input.patientAge ?? null,
          gender: (input.patientGender as any) ?? null,
          nationality: input.patientNationality ?? null,
        },
      });

      // 2. Resolve visitId -- use existing or create new
      let visitId: string;
      if (input.visitId) {
        const visit = await tx.visits.findUnique({ where: { visit_id: input.visitId } });
        if (!visit || visit.dentist_user_id !== userId)
          throw new GraphQLError("Visit not found", { extensions: { code: "NOT_FOUND" } });
        visitId = input.visitId;
      } else {
        const visit = await tx.visits.create({
          data: {
            patient_id: patient.patient_id,
            dentist_user_id: userId,
            visit_date: new Date(input.visitDate),
            phase: input.visitPhase as any,
          },
        });
        visitId = visit.visit_id;
      }

      // 3. Upsert chart
      const payload = { ...input.teethData, chart_name: input.chartName ?? null };
      await upsertChartRows(tx, visitId, payload);

      return visitId;
    }, { timeout: 10000 }),
};
