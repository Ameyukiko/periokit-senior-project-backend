import { prisma } from "../../lib/prisma";

export const xraysRepository = {
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
