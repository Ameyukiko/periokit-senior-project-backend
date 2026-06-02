import { visitsRepository } from "../../modules/visits/visits.repository";
import type { GraphQLContext } from "../context";
import { requireAuth } from "../guards";

export const visitTypeDefs = /* GraphQL */ `
  type Visit {
    id: ID!
    patientId: ID!
    visitDate: String!
    phase: String!
    doctorName: String
    studentId: Int
    status: String!
    hasChart: Boolean!
  }

  extend type Query {
    visitsByPatient(patientId: ID!): [Visit!]!
  }
`;

export const visitResolvers = {
  Query: {
    visitsByPatient: async (
      _parent: unknown,
      { patientId }: { patientId: string },
      context: GraphQLContext
    ) => {
      const { userId } = requireAuth(context);
      const visits = await visitsRepository.findByPatient(patientId, userId);
      return visits.map((v) => ({
        id: v.visit_id,
        patientId: v.patient_id,
        visitDate: v.visit_date.toISOString().split("T")[0],
        phase: v.phase,
        doctorName: v.doctor_name ?? null,
        studentId: v.student_id ?? null,
        status: v.status,
        hasChart: v.periodontal_charts.length > 0,
      }));
    },
  },
};
