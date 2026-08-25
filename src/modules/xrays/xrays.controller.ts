import type { Request, Response } from "express";
import sharp from "sharp";
import { env } from "../../lib/env";
import { supabaseAdmin } from "../../lib/supabase";
import { xraysRepository } from "./xrays.repository";
import { toXrayAssets } from "../../graphql/modules/xray.graphql";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isValidXrayUploadId = (uploadId: string) => UUID_REGEX.test(uploadId);

export const findDuplicateUploadIds = (uploadIds: string[]) =>
  uploadIds.filter((uploadId, index) => uploadIds.indexOf(uploadId) !== index);

const asArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(String) : value == null ? [] : [String(value)];

const rejected = (fileName: string, reason: string) => ({ fileName, reason });

const removeUploadedObject = async (storagePath: string) => {
  const { error } = await supabaseAdmin.storage
    .from(env.SUPABASE_XRAY_BUCKET)
    .remove([storagePath]);

  if (error) {
    console.error("Failed to clean up X-ray storage object", {
      storagePath,
      error,
    });
  }
};

export const uploadXrayAssets = async (req: Request, res: Response) => {
  const visitId = String(req.params.visitId);
  const userId = req.auth?.user.id;
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const uploadIds = asArray(req.body.uploadIds ?? req.body["uploadIds[]"]);

  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const visit = await xraysRepository.findOwnedVisit(visitId, userId);
  if (!visit) {
    res.status(403).json({ error: "Visit not found" });
    return;
  }

  if (files.length === 0) {
    res.status(400).json({ error: "At least one file is required" });
    return;
  }

  if (uploadIds.length !== files.length) {
    res.status(400).json({
      error: "Each file must have exactly one uploadId",
      reason: "upload_id_count_mismatch",
    });
    return;
  }

  const uploadedRecords: string[] = [];
  const rejectedFiles: { fileName: string; reason: string }[] = [];

  for (const [index, file] of files.entries()) {
    let storagePath: string | null = null;
    try {
      const uploadId = uploadIds[index];
      if (!uploadId || !isValidXrayUploadId(uploadId)) {
        rejectedFiles.push(rejected(file.originalname, "invalid_upload_id"));
        continue;
      }

      if (uploadIds.indexOf(uploadId) !== index) {
        rejectedFiles.push(rejected(file.originalname, "duplicate_upload_id"));
        continue;
      }

      if (file.size > env.SUPABASE_XRAY_MAX_FILE_SIZE_BYTES) {
        rejectedFiles.push(rejected(file.originalname, "file_too_large"));
        continue;
      }

      const { fileTypeFromBuffer } = await import("file-type");
      const detected = await fileTypeFromBuffer(file.buffer);
      if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
        rejectedFiles.push(rejected(file.originalname, "unsupported_type"));
        continue;
      }

      const metadata = await sharp(file.buffer, {
        limitInputPixels: env.SUPABASE_XRAY_MAX_PIXELS,
      }).metadata();
      if (!metadata.width || !metadata.height) {
        rejectedFiles.push(rejected(file.originalname, "invalid_dimensions"));
        continue;
      }

      storagePath = `${visitId}/${uploadId}.${detected.ext}`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from(env.SUPABASE_XRAY_BUCKET)
        .upload(storagePath, file.buffer, {
          contentType: detected.mime,
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const asset = await xraysRepository.createAsset({
        asset_id: uploadId,
        visit_id: visitId,
        uploaded_by: userId,
        storage_path: storagePath,
        file_name: file.originalname,
        mime_type: detected.mime,
        file_size: file.size,
        natural_width: metadata.width,
        natural_height: metadata.height,
        status: "pending",
      });
      uploadedRecords.push(asset.asset_id);
    } catch (error) {
      if (storagePath) {
        await removeUploadedObject(storagePath);
      }
      rejectedFiles.push(
        rejected(file.originalname, error instanceof Error ? "upload_failed" : "upload_failed")
      );
    }
  }

  try {
    const uploadedAssets = await toXrayAssets(
      await xraysRepository.findAssetsByIds(uploadedRecords)
    );
    res.status(200).json({ uploaded: uploadedAssets, rejected: rejectedFiles });
  } catch (error) {
    console.error("Failed to generate X-ray signed URLs after upload", {
      assetIds: uploadedRecords,
      error,
    });
    res.status(503).json({
      error: "Files were uploaded but signed URLs could not be generated",
      reason: "signed_url_generation_failed",
      uploadedAssetIds: uploadedRecords,
      rejected: rejectedFiles,
    });
  }
};
