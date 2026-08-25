import { prisma } from "../../lib/prisma";

export type SaveXrayBoardObject = {
  objectType: string;
  zIndex: number;
  posX: number;
  posY: number;
  width: number;
  height: number;
  rotation?: number | null;
  assetId?: string | null;
  slotCode?: string | null;
  noteText?: string | null;
  noteColor?: string | null;
  noteFontSize?: number | null;
};

export class XrayBoardError extends Error {
  constructor(
    message: string,
    public readonly code: "NOT_FOUND" | "FORBIDDEN" | "BAD_USER_INPUT"
  ) {
    super(message);
    this.name = "XrayBoardError";
  }
}

export const xraysRepository = {
  async saveBoard(
    userId: string,
    visitId: string,
    objects: SaveXrayBoardObject[]
  ) {
    return prisma.$transaction(async (tx) => {
      const visit = await tx.visits.findFirst({
        where: { visit_id: visitId, dentist_user_id: userId },
        select: { visit_id: true },
      });

      if (!visit) {
        throw new XrayBoardError("Visit not found", "NOT_FOUND");
      }

      const assetIds = objects.flatMap((object) =>
        object.assetId ? [object.assetId] : []
      );
      const uniqueAssetIds = [...new Set(assetIds)];
      const assets = uniqueAssetIds.length
        ? await tx.visit_xray_assets.findMany({
            where: { asset_id: { in: uniqueAssetIds } },
            select: { asset_id: true, visit_id: true },
          })
        : [];

      const hasInvalidAsset =
        assets.length !== uniqueAssetIds.length ||
        assets.some((asset) => asset.visit_id !== visitId);
      if (hasInvalidAsset) {
        throw new XrayBoardError("Invalid asset reference", "FORBIDDEN");
      }

      const board = await tx.xray_boards.upsert({
        where: { visit_id: visitId },
        create: { visit_id: visitId, status: "saved", saved_at: new Date() },
        update: { status: "saved", saved_at: new Date() },
      });

      await tx.xray_board_objects.deleteMany({
        where: { board_id: board.board_id },
      });

      if (objects.length > 0) {
        await tx.xray_board_objects.createMany({
          data: objects.map((object) => ({
            board_id: board.board_id,
            object_type: object.objectType as any,
            asset_id: object.assetId ?? null,
            z_index: object.zIndex,
            pos_x: object.posX,
            pos_y: object.posY,
            width: object.width,
            height: object.height,
            rotation: object.rotation ?? 0,
            slot_code: object.slotCode ?? null,
            note_text: object.noteText ?? null,
            note_color: object.noteColor ?? null,
            note_font_size: object.noteFontSize ?? null,
          })),
        });
      }

      await tx.visit_xray_assets.updateMany({
        where: { visit_id: visitId, asset_id: { in: uniqueAssetIds } },
        data: { status: "active" },
      });

      await tx.visit_xray_assets.updateMany({
        where: { visit_id: visitId, asset_id: { notIn: uniqueAssetIds } },
        data: { status: "orphaned" },
      });

      return board;
    });
  },

  async findAssetById(assetId: string) {
    return prisma.visit_xray_assets.findUnique({
      where: { asset_id: assetId },
    });
  },

  async createAsset(data: Parameters<typeof prisma.visit_xray_assets.create>[0]["data"]) {
    return prisma.visit_xray_assets.create({ data });
  },

  async findBoardByVisitId(visitId: string) {
    return prisma.xray_boards.findUnique({
      where: { visit_id: visitId },
      include: {
        objects: { orderBy: { z_index: "asc" } },
      },
    });
  },

  async findAssetsByVisitId(visitId: string) {
    return prisma.visit_xray_assets.findMany({
      where: { visit_id: visitId },
      orderBy: { created_at: "asc" },
    });
  },

  async findAssetsByIds(assetIds: string[]) {
    return prisma.visit_xray_assets.findMany({
      where: { asset_id: { in: assetIds } },
    });
  },

  async findOwnedVisit(visitId: string, userId: string) {
    return prisma.visits.findFirst({
      where: { visit_id: visitId, dentist_user_id: userId },
      include: { patient: true },
    });
  },
};
