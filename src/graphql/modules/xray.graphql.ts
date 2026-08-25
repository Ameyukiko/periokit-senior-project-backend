import { GraphQLError } from "graphql";
import { env } from "../../lib/env";
import { supabaseAdmin } from "../../lib/supabase";
import { xraysRepository } from "../../modules/xrays/xrays.repository";
import type { GraphQLContext } from "../context";
import { requireAuth } from "../guards";

type XrayAssetRecord = Awaited<ReturnType<typeof xraysRepository.findAssetsByVisitId>>[number];

export const toXrayAssets = async (assets: XrayAssetRecord[]) => {
  if (assets.length === 0) return [];

  const { data: signedUrls, error } = await supabaseAdmin.storage
    .from(env.SUPABASE_XRAY_BUCKET)
    .createSignedUrls(
      assets.map((asset) => asset.storage_path),
      env.SUPABASE_XRAY_SIGNED_URL_EXPIRES_IN
    );

  if (error) throw error;

  const signedUrlByPath = new Map(
    signedUrls.map((signedUrl) => [signedUrl.path, signedUrl.signedUrl])
  );
  const urlExpiresAt = new Date(
    Date.now() + env.SUPABASE_XRAY_SIGNED_URL_EXPIRES_IN * 1000
  ).toISOString();

  return assets.flatMap((asset) => {
    const signedUrl = signedUrlByPath.get(asset.storage_path);
    return signedUrl
      ? [
          {
            id: asset.asset_id,
            fileName: asset.file_name,
            mimeType: asset.mime_type,
            fileSize: asset.file_size,
            naturalWidth: asset.natural_width,
            naturalHeight: asset.natural_height,
            status: asset.status,
            signedUrl,
            urlExpiresAt,
          },
        ]
      : [];
  });
};

const toXrayBoard = async (
  board: NonNullable<Awaited<ReturnType<typeof xraysRepository.findBoardByVisitId>>>,
  assets: XrayAssetRecord[]
) => ({
  id: board.board_id,
  visitId: board.visit_id,
  status: board.status,
  savedAt: board.saved_at?.toISOString() ?? null,
  objects: board.objects.map((object) => ({
    id: object.object_id,
    objectType: object.object_type,
    zIndex: object.z_index,
    posX: object.pos_x,
    posY: object.pos_y,
    width: object.width,
    height: object.height,
    rotation: Number(object.rotation),
    assetId: object.asset_id,
    slotCode: object.slot_code,
    noteText: object.note_text,
    noteColor: object.note_color,
    noteFontSize: object.note_font_size,
  })),
  assets: await toXrayAssets(assets),
});

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
      { visitId }: { visitId: string },
      context: GraphQLContext
    ) => {
      const { userId } = requireAuth(context);
      const visit = await xraysRepository.findOwnedVisit(visitId, userId);
      if (!visit) {
        throw new GraphQLError("Visit not found", {
          extensions: { code: "NOT_FOUND" },
        });
      }

      const board = await xraysRepository.findBoardByVisitId(visitId);
      if (!board) return null;

      const assets = await xraysRepository.findAssetsByVisitId(visitId);
      return toXrayBoard(board, assets);
    },

    refreshXrayUrls: async (
      _parent: unknown,
      { assetIds }: { assetIds: string[] },
      context: GraphQLContext
    ) => {
      const { userId } = requireAuth(context);
      const assets = await xraysRepository.findAssetsByIds(assetIds);
      const visitIds = [...new Set(assets.map((asset) => asset.visit_id))];
      const ownedVisitIds = new Set(
        (
          await Promise.all(
            visitIds.map((visitId) =>
              xraysRepository.findOwnedVisit(visitId, userId)
            )
          )
        )
          .filter((visit): visit is NonNullable<typeof visit> => Boolean(visit))
          .map((visit) => visit.visit_id)
      );

      return toXrayAssets(
        assets.filter((asset) => ownedVisitIds.has(asset.visit_id))
      );
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
