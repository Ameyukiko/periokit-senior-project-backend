import { GraphQLError } from "graphql";
import { JSONResolver } from "graphql-scalars";
import {
  chartsRepository,
  type ChartPayload,
} from "../../modules/charts/charts.repository";
import { findVisitById } from "../../modules/visits/visits.repository";
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
    visitId: ID!
    chartName: String
    teethData: JSON!
  }

  extend type Query {
    chartByVisit(visitId: ID!): PeriodontalChart
  }

  extend type Mutation {
    saveChart(input: SaveChartInput!): PeriodontalChart!
  }
`;

export { JSONResolver };

const requireVisitOwnership = async (visitId: string, userId: string) => {
  const visit = await findVisitById(visitId);
  if (!visit || visit.dentist_user_id !== userId) {
    throw new GraphQLError("Visit not found", {
      extensions: { code: "NOT_FOUND" },
    });
  }
  return visit;
};

export const chartResolvers = {
  Query: {
    chartByVisit: async (
      _parent: unknown,
      { visitId }: { visitId: string },
      context: GraphQLContext
    ) => {
      const { userId } = requireAuth(context);
      await requireVisitOwnership(visitId, userId);
      return chartsRepository.findByVisitAndMap(visitId);
    },
  },

  Mutation: {
    saveChart: async (
      _parent: unknown,
      { input }: { input: { visitId: string; chartName?: string; teethData: ChartPayload } },
      context: GraphQLContext
    ) => {
      const { userId } = requireAuth(context);
      await requireVisitOwnership(input.visitId, userId);

      const payload: ChartPayload = {
        ...input.teethData,
        chart_name: input.chartName ?? null,
      };

      await chartsRepository.upsertChart(input.visitId, payload);

      const result = await chartsRepository.findByVisitAndMap(input.visitId);
      if (!result) {
        throw new GraphQLError("Chart not found after save", {
          extensions: { code: "INTERNAL_SERVER_ERROR" },
        });
      }

      return result;
    },
  },
};
