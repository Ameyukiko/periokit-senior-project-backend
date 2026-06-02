import { patientsRepository } from "../../modules/patients/patients.repository";
import type { GraphQLContext } from "../context";
import { requireAuth } from "../guards";

export const patientTypeDefs = /* GraphQL */ `
  type PatientListItem {
    id: ID!
    hn: String!
    firstName: String!
    lastName: String!
    age: Int
    gender: String
    lastVisitDate: String
  }

  type PatientListResult {
    items: [PatientListItem!]!
    total: Int!
    page: Int!
    pageSize: Int!
    totalPages: Int!
  }

  extend type Query {
    myPatients(
      search: String
      dateFrom: String
      dateTo: String
      page: Int
      pageSize: Int
    ): PatientListResult!
  }
`;

export const patientResolvers = {
  Query: {
    myPatients: async (
      _parent: unknown,
      args: {
        search?: string;
        dateFrom?: string;
        dateTo?: string;
        page?: number;
        pageSize?: number;
      },
      context: GraphQLContext
    ) => {
      const { userId } = requireAuth(context);
      const result = await patientsRepository.findAll(userId, args);

      return {
        ...result,
        items: result.items.map((p) => ({
          id: p.patient_id,
          hn: p.hn,
          firstName: p.first_name,
          lastName: p.last_name,
          age: p.age ?? null,
          gender: p.gender ?? null,
          lastVisitDate: p.visits[0]?.visit_date
            ? new Date(p.visits[0].visit_date).toISOString().split("T")[0]
            : null,
        })),
      };
    },
  },
};
