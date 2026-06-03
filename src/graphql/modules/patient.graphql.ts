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
    nationality: String
    lastVisitDate: String
  }

  type PatientListResult {
    items: [PatientListItem!]!
    total: Int!
    page: Int!
    pageSize: Int!
    totalPages: Int!
  }

  type PatientWithVisits {
    id: ID!
    hn: String!
    firstName: String!
    lastName: String!
    age: Int
    gender: String
    nationality: String
    visitCount: Int!
    lastVisitDate: String
    visits: [Visit!]!
  }

  extend type Query {
    myPatients(
      search: String
      dateFrom: String
      dateTo: String
      page: Int
      pageSize: Int
    ): PatientListResult!
    patientById(id: ID!): PatientWithVisits
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
        lastVisitDate: patient.visits[0]?.visit_date
          ? new Date(patient.visits[0].visit_date).toISOString().split("T")[0]
          : null,
        visits: patient.visits.map((v) => ({
          id: v.visit_id,
          patientId: v.patient_id,
          visitDate: v.visit_date.toISOString().split("T")[0],
          phase: v.phase,
          doctorName: v.doctor_name ?? null,
          studentId: v.student_id ?? null,
          status: v.status,
          hasChart: v.periodontal_charts.length > 0,
        })),
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
          nationality: p.nationality ?? null,
          lastVisitDate: p.visits[0]?.visit_date
            ? new Date(p.visits[0].visit_date).toISOString().split("T")[0]
            : null,
        })),
      };
    },
  },
};
