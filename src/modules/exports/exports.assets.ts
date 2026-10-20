import sharp from "sharp";
import { env } from "../../lib/env";
import { supabaseAdmin } from "../../lib/supabase";
import { ExportError, throwIfAborted } from "./exports.errors";
import type { ExportSnapshot } from "./exports.snapshot";
import { mapWithConcurrency } from "./exports.concurrent";

export type ExportAssetMap = Map<string, string>;

export const loadXrayAssetsForRender = async (
  snapshot: ExportSnapshot,
  grayscale: boolean,
  signal: AbortSignal
): Promise<ExportAssetMap> => {
  const xray = snapshot.xray;
  if (!xray) return new Map();

  const referencedIds = [
    ...new Set(
      xray.objects.flatMap((object) =>
        object.objectType === "image" && object.assetId ? [object.assetId] : []
      )
    ),
  ];
  if (referencedIds.length > env.EXPORT_MAX_ASSETS) {
    throw new ExportError(422, "EXPORT_LIMIT_EXCEEDED", "Too many image assets", {
      limit: env.EXPORT_MAX_ASSETS,
    });
  }

  const byId = new Map(xray.assets.map((asset) => [asset.id, asset]));
  const missingMetadata = referencedIds.filter((id) => !byId.has(id));
  if (missingMetadata.length > 0) {
    throw new ExportError(
      422,
      "EXPORT_ASSET_UNAVAILABLE",
      "One or more selected images are unavailable",
      { assetIds: missingMetadata }
    );
  }

  const sourceBytes = referencedIds.reduce(
    (total, id) => total + (byId.get(id)?.fileSize ?? 0),
    0
  );
  if (sourceBytes > env.EXPORT_MAX_SOURCE_BYTES) {
    throw new ExportError(422, "EXPORT_LIMIT_EXCEEDED", "Image assets are too large", {
      limitBytes: env.EXPORT_MAX_SOURCE_BYTES,
    });
  }

  const rendered = new Map<string, string>();
  let downloadedBytes = 0;
  await mapWithConcurrency(referencedIds, env.EXPORT_ASSET_CONCURRENCY, async (assetId) => {
    throwIfAborted(signal);
    const asset = byId.get(assetId)!;
    const { data, error } = await supabaseAdmin.storage
      .from(env.SUPABASE_XRAY_BUCKET)
      .download(asset.storagePath);

    if (error || !data) {
      throw new ExportError(
        422,
        "EXPORT_ASSET_UNAVAILABLE",
        "A selected image could not be read",
        { assetId }
      );
    }

    const source = Buffer.from(await data.arrayBuffer());
    downloadedBytes += source.length;
    if (downloadedBytes > env.EXPORT_MAX_SOURCE_BYTES) {
      throw new ExportError(422, "EXPORT_LIMIT_EXCEEDED", "Image assets are too large", {
        limitBytes: env.EXPORT_MAX_SOURCE_BYTES,
      });
    }
    if (source.length > env.SUPABASE_XRAY_MAX_FILE_SIZE_BYTES) {
      throw new ExportError(422, "EXPORT_LIMIT_EXCEEDED", "An image is too large", {
        assetId,
        limitBytes: env.SUPABASE_XRAY_MAX_FILE_SIZE_BYTES,
      });
    }

    try {
      let pipeline = sharp(source, { limitInputPixels: env.SUPABASE_XRAY_MAX_PIXELS })
        .rotate()
        .resize({
          width: 1800,
          height: 1200,
          fit: "inside",
          withoutEnlargement: true,
        });
      if (grayscale) pipeline = pipeline.grayscale();
      const output = await pipeline.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
      rendered.set(assetId, `data:image/jpeg;base64,${output.toString("base64")}`);
    } catch {
      throw new ExportError(
        422,
        "EXPORT_ASSET_UNAVAILABLE",
        "A selected image is invalid or unreadable",
        { assetId }
      );
    }
  });

  throwIfAborted(signal);
  return rendered;
};
