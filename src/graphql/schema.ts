import { userResolvers, userTypeDefs } from "./modules/user.graphql";
import { chartResolvers, chartTypeDefs, JSONResolver } from "./modules/chart.graphql";

export const typeDefs = /* GraphQL */ `
  scalar JSON

  type Query {
    health: Health!
  }

  type Health {
    ok: Boolean!
    message: String!
  }
  ${userTypeDefs}
  ${chartTypeDefs}
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
  },
  Mutation: {
    ...chartResolvers.Mutation,
  },
};
