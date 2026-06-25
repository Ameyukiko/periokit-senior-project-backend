import { describe, it, expect, vi } from "vitest";

// charts.repository imports the Prisma client at module load; stub it so the
// pure mapping function can be tested without a database connection.
vi.mock("../lib/prisma", () => ({ prisma: {} }));

import { mapChartResponse } from "../modules/charts/charts.repository";

const baseChart: any = {
  chart_id: "chart-1",
  visit_id: "visit-1",
  chart_name: "Initial",
  status: "saved",
  updated_at: new Date("2026-06-21T10:00:00.000Z"),
  summary: {
    total_teeth: 28,
    bop_percentage: "12.5",
    plaque_percentage: "30",
  },
  visit: {
    patient_id: "patient-1",
    phase: "initial",
    doctor_name: "Dr. Pikul",
    student_id: 662115051,
    visit_date: new Date("2026-06-20T00:00:00.000Z"),
    patient: {
      hn: "HN001",
      first_name: "John",
      last_name: "Doe",
      age: 42,
      gender: "male",
      nationality: "Thai",
    },
  },
};

const teethPayload = [
  {
    tooth_number: 11,
    tooth_arch: "upper",
    status: "present",
    mobility: null,
    prognosis_kc: null,
    prognosis_mn: null,
    tooth_note: null,
    surfaces: [],
    furcations: [],
  },
];

describe("mapChartResponse", () => {
  it("maps core chart fields", () => {
    const result = mapChartResponse(baseChart, teethPayload as any);
    expect(result.id).toBe("chart-1");
    expect(result.visitId).toBe("visit-1");
    expect(result.patientId).toBe("patient-1");
    expect(result.chartName).toBe("Initial");
    expect(result.teethData).toBe(teethPayload);
    expect(result.updatedAt).toBe("2026-06-21T10:00:00.000Z");
  });

  it("coerces numeric summary strings to numbers", () => {
    const result = mapChartResponse(baseChart, teethPayload as any);
    expect(result.summary).toEqual({
      total_teeth: 28,
      bop_percentage: 12.5,
      plaque_percentage: 30,
    });
  });

  it("returns null summary when absent", () => {
    const result = mapChartResponse({ ...baseChart, summary: null }, teethPayload as any);
    expect(result.summary).toBeNull();
  });

  it("builds patientInfo with capitalised gender and joined name", () => {
    const result = mapChartResponse(baseChart, teethPayload as any);
    expect(result.patientInfo).toMatchObject({
      hn: "HN001",
      patientName: "John Doe",
      gender: "Male",
      nationality: "Thai",
      date: "2026-06-20",
      visitPhase: "initial",
      doctor: "Dr. Pikul",
      studentId: "662115051",
    });
  });

  it("returns null patientInfo and patientId when visit/patient missing", () => {
    const result = mapChartResponse(
      { ...baseChart, visit: null },
      teethPayload as any
    );
    expect(result.patientInfo).toBeNull();
    expect(result.patientId).toBeNull();
  });
});
