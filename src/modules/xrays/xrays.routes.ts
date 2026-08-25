import { NextFunction, Request, Response, Router } from "express";
import multer, { MulterError } from "multer";
import { env } from "../../lib/env";
import { authenticate } from "../auth/auth.middleware";
import { uploadXrayAssets } from "./xrays.controller";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 18,
    fileSize: env.SUPABASE_XRAY_MAX_FILE_SIZE_BYTES,
  },
});

const parseXrayUpload = (req: Request, res: Response, next: NextFunction) => {
  upload.array("files[]", 18)(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof MulterError && error.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({
        error: "One or more files exceed the maximum allowed size",
        reason: "file_too_large",
      });
      return;
    }

    res.status(400).json({
      error: error instanceof Error ? error.message : "Invalid multipart upload",
      reason: "invalid_upload",
    });
  });
};

router.post(
  "/visits/:visitId/xray-assets",
  authenticate,
  parseXrayUpload,
  uploadXrayAssets
);

export default router;
