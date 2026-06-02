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
});

export const chartsRepository = {
  findByVisit: (visitId: string) =>
    prisma.periodontal_charts.findUnique({
      where: { visit_id: visitId },
      include: {
        teeth: {
          include: { surfaces: true, sites: true, furcations: true },
        },
        summary: true,
      },
    }),

  findByVisitAndMap: async (visitId: string) => {
    const chart = await chartsRepository.findByVisit(visitId);
    if (!chart) return null;
    return mapChartResponse(chart, buildTeethPayload(chart.teeth));
  },

  upsertChart: (visitId: string, payload: ChartPayload) =>
    prisma.$transaction(async (tx) => {
      const chart = await tx.periodontal_charts.upsert({
        where: { visit_id: visitId },
        update: {
          chart_name: payload.chart_name ?? null,
          status: "saved",
          updated_at: new Date(),
        },
        create: {
          visit_id: visitId,
          chart_name: payload.chart_name ?? null,
          status: "saved",
        },
      });

      await tx.periodontal_chart_teeth.deleteMany({
        where: { chart_id: chart.chart_id },
      });

      for (const tooth of payload.teeth) {
        const chartTooth = await tx.periodontal_chart_teeth.create({
          data: {
            chart_id: chart.chart_id,
            tooth_number: tooth.tooth_number,
            arch: tooth.tooth_arch as any,
            status: tooth.status as any,
            mobility: tooth.mobility ?? null,
            prognosis_kc: (tooth.prognosis_kc as any) ?? null,
            prognosis_mn: (tooth.prognosis_mn as any) ?? null,
            tooth_note: tooth.tooth_note ?? null,
          },
        });

        for (const surface of tooth.surfaces) {
          await tx.periodontal_tooth_surfaces.create({
            data: {
              chart_tooth_id: chartTooth.chart_tooth_id,
              surface: surface.surface as any,
              ktw_mm: surface.ktw_mm ?? null,
            },
          });

          for (const site of surface.sites) {
            await tx.periodontal_tooth_sites.create({
              data: {
                chart_tooth_id: chartTooth.chart_tooth_id,
                surface: surface.surface as any,
                site_position: site.site_position as any,
                pd_mm: site.pd_mm ?? null,
                recession_mm: site.recession_mm ?? null,
                cal_mm: site.cal_mm ?? null,
                bop: site.bop,
                plaque: site.plaque,
              },
            });
          }
        }

        for (const fur of tooth.furcations) {
          await tx.periodontal_tooth_furcations.create({
            data: {
              chart_tooth_id: chartTooth.chart_tooth_id,
              surface: fur.surface as any,
              site_index: fur.site_index,
              grade: fur.grade as any,
            },
          });
        }
      }

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
    }),
};
