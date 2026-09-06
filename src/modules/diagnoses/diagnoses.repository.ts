import { Prisma } from "@prisma/client";

export type DiagnosisComplexityData = {
  boneLossPercent: number | null;
  teethLostToPerio: number | null;
  directEvidence: "no_loss" | "lt_2mm" | "gte_2mm" | null;
  phenotype: "heavy_biofilm" | "commensurate" | "exceeds" | null;
  smoking: "non_smoker" | "lt_10" | "gte_10" | null;
  diabetes: "none" | "hba1c_lt_7" | "hba1c_gte_7" | null;
  ageYears: number | null;
  complexityStageOverride: "stage_1" | "stage_2" | "stage_3" | "stage_4" | null;
};

export type SaveDiagnosisData = {
  extent: "localized" | "generalized" | "molar_incisor" | null;
  complexity: DiagnosisComplexityData;
};

type TransactionClient = Omit<
  typeof import("../../lib/prisma").prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export const upsertDiagnosis = (
  tx: TransactionClient,
  visitId: string,
  data: SaveDiagnosisData
) =>
  tx.periodontal_diagnoses.upsert({
    where: { visit_id: visitId },
    create: {
      visit_id: visitId,
      extent: data.extent,
      complexity: data.complexity as Prisma.InputJsonValue,
    },
    update: {
      extent: data.extent,
      complexity: data.complexity as Prisma.InputJsonValue,
    },
  });
