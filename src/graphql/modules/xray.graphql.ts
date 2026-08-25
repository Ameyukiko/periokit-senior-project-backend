import { GraphQLError } from "graphql";
import type { GraphQLContext } from "../context";
import { requireAuth } from "../guards";

export const xrayTypeDefs = /* GraphQL */ `
  type XrayAsset {
    id: ID!
    fileName: String!
    mimeType: String!
    fileSize: Int!
    naturalWidth: Int!
    naturalHeight: Int!
    status: String!
    signedUrl: String!
    urlExpiresAt: String!
  }

  type XrayBoardObject {
    id: ID!
    objectType: String!
    zIndex: Int!
    posX: Int!
    posY: Int!
    width: Int!
    height: Int!
    rotation: Float!
    assetId: ID
    slotCode: String
    noteText: String
    noteColor: String
    noteFontSize: Int
  }

  type XrayBoard {
    id: ID!
    visitId: ID!
    status: String!
    savedAt: String
    objects: [XrayBoardObject!]!
    assets: [XrayAsset!]!
  }

  input XrayBoardObjectInput {
    objectType: String!
    zIndex: Int!
    posX: Int!
    posY: Int!
    width: Int!
    height: Int!
    rotation: Float
    assetId: ID
    slotCode: String
    noteText: String
    noteColor: String
    noteFontSize: Int
  }

  input SaveXrayBoardInput {
    visitId: ID!
    objects: [XrayBoardObjectInput!]!
  }

  extend type Query {
    xrayBoardByVisit(visitId: ID!): XrayBoard
    refreshXrayUrls(assetIds: [ID!]!): [XrayAsset!]!
  }

  extend type Mutation {
    saveXrayBoard(input: SaveXrayBoardInput!): XrayBoard!
  }
`;

export const xrayResolvers = {
  Query: {
    xrayBoardByVisit: async (
      _parent: unknown,
      _args: { visitId: string },
      context: GraphQLContext
    ) => {
      requireAuth(context);
      return null;
    },

    refreshXrayUrls: async (
      _parent: unknown,
      _args: { assetIds: string[] },
      context: GraphQLContext
    ) => {
      requireAuth(context);
      return [];
    },
  },

  Mutation: {
    saveXrayBoard: async (
      _parent: unknown,
      _args: { input: unknown },
      context: GraphQLContext
    ) => {
      requireAuth(context);
      throw new GraphQLError("Not implemented", {
        extensions: { code: "NOT_IMPLEMENTED" },
      });
    },
  },
};
