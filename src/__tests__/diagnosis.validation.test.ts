import { describe, expect, it } from "vitest";
import { diagnosisEnumResolvers, diagnosisSchema } from "../graphql/modules/chart.graphql";

const emptyComplexity = {
  boneLossPercent: null,
  teethLostToPerio: null,
  directEvidence: null,
  phenotype: null,
  smoking: null,
  diabetes: null,
  ageYears: null,
  calStageOverride: null,
  boneLossStageOverride: null,
  toothLossStageOverride: null,
  complexityStageOverride: null,
};

describe("combined chart diagnosis validation", () => {
  it("accepts a new visit diagnosis with every supplemental input null", () => {
    expect(
      diagnosisSchema.safeParse({ extent: null, complexity: emptyComplexity }).success
    ).toBe(true);
  });

  it("rejects unknown keys and numeric values outside supported ranges", () => {
    expect(
      diagnosisSchema.safeParse({
        extent: null,
        complexity: { ...emptyComplexity, boneLossPercent: 101, cal: 5 },
      }).success
    ).toBe(false);
    expect(
      diagnosisSchema.safeParse({
        extent: null,
        complexity: { ...emptyComplexity, teethLostToPerio: -1 },
      }).success
    ).toBe(false);
  });

  it("maps GraphQL enum values to canonical lowercase database values", () => {
    expect(diagnosisEnumResolvers.DiagnosisExtent.molar_incisor).toBe("molar_incisor");
    expect(diagnosisEnumResolvers.DirectEvidence.gte_2mm).toBe("gte_2mm");
    expect(diagnosisEnumResolvers.DiagnosisStage.stage_4).toBe("stage_4");
    expect(diagnosisEnumResolvers.DiabetesControl.hba1c_gte_7).toBe("hba1c_gte_7");
  });

  it("accepts a stage selected directly from each criteria row", () => {
    const result = diagnosisSchema.safeParse({
      extent: null,
      complexity: {
        ...emptyComplexity,
        calStageOverride: "stage_2",
        boneLossStageOverride: "stage_3",
        toothLossStageOverride: "stage_4",
        complexityStageOverride: "stage_3",
      },
    });

    expect(result.success).toBe(true);
  });
});
