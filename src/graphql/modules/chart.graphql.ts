import { GraphQLError } from "graphql";
import { JSONResolver } from "graphql-scalars";
import { z } from "zod";
import {
  chartsRepository,
  type SaveChartFullInput,
} from "../../modules/charts/charts.repository";
import { visitsRepository } from "../../modules/visits/visits.repository";
import type { GraphQLContext } from "../context";
import { requireAuth } from "../guards";

export const chartTypeDefs = /* GraphQL */ `
  enum DiagnosisExtent {
    localized
    generalized
    molar_incisor
  }

  enum DiagnosisStage {
    stage_1
    stage_2
    stage_3
    stage_4
  }

  enum DirectEvidence {
    no_loss
    lt_2mm
    gte_2mm
  }

  enum DiagnosisPhenotype {
    heavy_biofilm
    commensurate
    exceeds
  }

  enum SmokingExposure {
    non_smoker
    lt_10
    gte_10
  }

  enum DiabetesControl {
    none
    hba1c_lt_7
    hba1c_gte_7
  }

  type DiagnosisComplexity {
    boneLossPercent: Float
    teethLostToPerio: Int
    directEvidence: DirectEvidence
    phenotype: DiagnosisPhenotype
    smoking: SmokingExposure
    diabetes: DiabetesControl
    ageYears: Int
    calStageOverride: DiagnosisStage
    boneLossStageOverride: DiagnosisStage
    toothLossStageOverride: DiagnosisStage
    complexityStageOverride: DiagnosisStage
  }

  type PeriodontalDiagnosis {
    id: ID!
    visitId: ID!
    extent: DiagnosisExtent
    complexity: DiagnosisComplexity!
    createdAt: String!
    updatedAt: String!
  }

  input DiagnosisComplexityInput {
    boneLossPercent: Float
    teethLostToPerio: Int
    directEvidence: DirectEvidence
    phenotype: DiagnosisPhenotype
    smoking: SmokingExposure
    diabetes: DiabetesControl
    ageYears: Int
    calStageOverride: DiagnosisStage
    boneLossStageOverride: DiagnosisStage
    toothLossStageOverride: DiagnosisStage
    complexityStageOverride: DiagnosisStage
  }

  input DiagnosisInput {
    extent: DiagnosisExtent
    complexity: DiagnosisComplexityInput!
  }

  type PatientInfo {
    hn: String!
    patientName: String!
    age: Int
    gender: String
    nationality: String
    date: String!
    doctor: String
    studentId: String
    visitPhase: String
  }

  type PeriodontalChart {
    id: ID!
    visitId: ID!
    patientId: ID
    chartName: String
    status: String!
    teethData: JSON!
    summary: JSON
    updatedAt: String!
    patientInfo: PatientInfo
    diagnosis: PeriodontalDiagnosis
  }

  input SaveChartInput {
    visitId: ID
    chartName: String
    teethData: JSON!
    patientHn: String!
    patientFirstName: String!
    patientLastName: String!
    patientAge: Int
    patientGender: String
    patientNationality: String
    visitDate: String!
    visitPhase: String!
    completeVisit: Boolean
    diagnosis: DiagnosisInput!
  }

  extend type Query {
    chartByVisit(visitId: ID!): PeriodontalChart
  }

  extend type Mutation {
    saveChart(input: SaveChartInput!): PeriodontalChart!
  }
`;

export { JSONResolver };

export const diagnosisEnumResolvers = {
  DiagnosisExtent: {
    localized: "localized",
    generalized: "generalized",
    molar_incisor: "molar_incisor",
  },
  DiagnosisStage: {
    stage_1: "stage_1",
    stage_2: "stage_2",
    stage_3: "stage_3",
    stage_4: "stage_4",
  },
  DirectEvidence: {
    no_loss: "no_loss",
    lt_2mm: "lt_2mm",
    gte_2mm: "gte_2mm",
  },
  DiagnosisPhenotype: {
    heavy_biofilm: "heavy_biofilm",
    commensurate: "commensurate",
    exceeds: "exceeds",
  },
  SmokingExposure: {
    non_smoker: "non_smoker",
    lt_10: "lt_10",
    gte_10: "gte_10",
  },
  DiabetesControl: {
    none: "none",
    hba1c_lt_7: "hba1c_lt_7",
    hba1c_gte_7: "hba1c_gte_7",
  },
};

export const diagnosisSchema = z
  .object({
    extent: z.enum(["localized", "generalized", "molar_incisor"]).nullable().optional(),
    complexity: z
      .object({
        boneLossPercent: z.number().min(0).max(100).nullable().optional(),
        teethLostToPerio: z.number().int().min(0).max(32).nullable().optional(),
        directEvidence: z.enum(["no_loss", "lt_2mm", "gte_2mm"]).nullable().optional(),
        phenotype: z.enum(["heavy_biofilm", "commensurate", "exceeds"]).nullable().optional(),
        smoking: z.enum(["non_smoker", "lt_10", "gte_10"]).nullable().optional(),
        diabetes: z.enum(["none", "hba1c_lt_7", "hba1c_gte_7"]).nullable().optional(),
        ageYears: z.number().int().min(0).max(150).nullable().optional(),
        calStageOverride: z
          .enum(["stage_1", "stage_2", "stage_3", "stage_4"])
          .nullable()
          .optional(),
        boneLossStageOverride: z
          .enum(["stage_1", "stage_2", "stage_3", "stage_4"])
          .nullable()
          .optional(),
        toothLossStageOverride: z
          .enum(["stage_1", "stage_2", "stage_3", "stage_4"])
          .nullable()
          .optional(),
        complexityStageOverride: z
          .enum(["stage_1", "stage_2", "stage_3", "stage_4"])
          .nullable()
          .optional(),
      })
      .strict(),
  })
  .strict();

export const chartResolvers = {
  Query: {
    chartByVisit: async (
      _parent: unknown,
      { visitId }: { visitId: string },
      context: GraphQLContext
    ) => {
      const { userId } = requireAuth(context);
      const visit = await visitsRepository.findById(visitId);
      if (!visit || visit.dentist_user_id !== userId) {
        throw new GraphQLError("Visit not found", {
          extensions: { code: "NOT_FOUND" },
        });
      }
      return chartsRepository.findByVisitAndMap(visitId);
    },
  },

  Mutation: {
    saveChart: async (
      _parent: unknown,
      {
        input,
      }: {
        input: {
          visitId?: string;
          chartName?: string;
          teethData: SaveChartFullInput["teethData"];
          patientHn: string;
          patientFirstName: string;
          patientLastName: string;
          patientAge?: number;
          patientGender?: string;
          patientNationality?: string;
          visitDate: string;
          visitPhase: string;
          completeVisit?: boolean;
          diagnosis: SaveChartFullInput["diagnosis"];
        };
      },
      context: GraphQLContext
    ) => {
      const { userId } = requireAuth(context);

      const parsedDiagnosis = diagnosisSchema.safeParse(input.diagnosis);
      if (!parsedDiagnosis.success) {
        throw new GraphQLError("Invalid diagnosis input", {
          extensions: { code: "BAD_USER_INPUT", issues: parsedDiagnosis.error.issues },
        });
      }

      const diagnosis = parsedDiagnosis.data;

      const visitId = await chartsRepository.saveChartFull(userId, {
        visitId: input.visitId ?? null,
        chartName: input.chartName ?? null,
        teethData: input.teethData,
        patientHn: input.patientHn,
        patientFirstName: input.patientFirstName,
        patientLastName: input.patientLastName,
        patientAge: input.patientAge ?? null,
        patientGender: input.patientGender ?? null,
        patientNationality: input.patientNationality ?? null,
        visitDate: input.visitDate,
        visitPhase: input.visitPhase,
        completeVisit: input.completeVisit ?? false,
        diagnosis: {
          extent: diagnosis.extent ?? null,
          complexity: {
            boneLossPercent: diagnosis.complexity.boneLossPercent ?? null,
            teethLostToPerio: diagnosis.complexity.teethLostToPerio ?? null,
            directEvidence: diagnosis.complexity.directEvidence ?? null,
            phenotype: diagnosis.complexity.phenotype ?? null,
            smoking: diagnosis.complexity.smoking ?? null,
            diabetes: diagnosis.complexity.diabetes ?? null,
            ageYears: diagnosis.complexity.ageYears ?? null,
            calStageOverride: diagnosis.complexity.calStageOverride ?? null,
            boneLossStageOverride: diagnosis.complexity.boneLossStageOverride ?? null,
            toothLossStageOverride: diagnosis.complexity.toothLossStageOverride ?? null,
            complexityStageOverride:
              diagnosis.complexity.complexityStageOverride ?? null,
          },
        },
      });

      const result = await chartsRepository.findByVisitAndMap(visitId);
      if (!result) {
        throw new GraphQLError("Chart not found after save", {
          extensions: { code: "INTERNAL_SERVER_ERROR" },
        });
      }

      return result;
    },
  },
};
