import { GraphQLError } from "graphql";
import { JSONResolver } from "graphql-scalars";
import {
  chartsRepository,
  type SaveChartFullInput,
} from "../../modules/charts/charts.repository";
import { visitsRepository } from "../../modules/visits/visits.repository";
import type { GraphQLContext } from "../context";
import { requireAuth } from "../guards";

export const chartTypeDefs = /* GraphQL */ `
  type PeriodontalChart {
    id: ID!
    visitId: ID!
    chartName: String
    status: String!
    teethData: JSON!
    summary: JSON
    updatedAt: String!
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
  }

  extend type Query {
    chartByVisit(visitId: ID!): PeriodontalChart
  }

  extend type Mutation {
    saveChart(input: SaveChartInput!): PeriodontalChart!
  }
`;

export { JSONResolver };

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
        };
      },
      context: GraphQLContext
    ) => {
      const { userId } = requireAuth(context);

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
