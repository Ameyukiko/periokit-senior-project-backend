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

  type PatientWithVisitCount {
    id: ID!
    hn: String!
    firstName: String!
    lastName: String!
    age: Int
    gender: String
    nationality: String
    visitCount: Int!
  }

  extend type Query {
    myPatients(
      search: String
      dateFrom: String
      dateTo: String
      page: Int
      pageSize: Int
    ): PatientListResult!
    patientById(id: ID!): PatientWithVisitCount
  }
`;

export const patientResolvers = {
  Query: {
    patientById: async (
      _parent: unknown,
      { id }: { id: string },
      context: GraphQLContext
    ) => {
      const { userId } = requireAuth(context);
      const patient = await patientsRepository.findById(id, userId);
      if (!patient) return null;
      return {
        id: patient.patient_id,
        hn: patient.hn,
        firstName: patient.first_name,
        lastName: patient.last_name,
        age: patient.age ?? null,
        gender: patient.gender ?? null,
        nationality: patient.nationality ?? null,
        visitCount: patient._count.visits,
      };
    },

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
