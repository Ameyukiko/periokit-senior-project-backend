import { userResolvers, userTypeDefs } from "./modules/user.graphql";
import { chartResolvers, chartTypeDefs, JSONResolver } from "./modules/chart.graphql";
import { patientResolvers, patientTypeDefs } from "./modules/patient.graphql";
import { visitResolvers, visitTypeDefs } from "./modules/visit.graphql";
import { xrayResolvers, xrayTypeDefs } from "./modules/xray.graphql";

export const typeDefs = /* GraphQL */ `
  scalar JSON

  type Query {
    health: Health!
  }

  type Health {
    ok: Boolean!
    message: String!
  }

  type Mutation
  ${userTypeDefs}
  ${chartTypeDefs}
  ${patientTypeDefs}
  ${visitTypeDefs}
  ${xrayTypeDefs}
`;

export const resolvers = {
  JSON: JSONResolver,
  Query: {
    health: () => ({
      ok: true,
      message: "PerioKit Backend API is running",
    }),
    ...userResolvers.Query,
    ...chartResolvers.Query,
    ...patientResolvers.Query,
    ...visitResolvers.Query,
    ...xrayResolvers.Query,
  },
  Mutation: {
    ...chartResolvers.Mutation,
    ...xrayResolvers.Mutation,
  },
};
