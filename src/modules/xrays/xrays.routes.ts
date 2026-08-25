import { Router } from "express";
import multer from "multer";
import { authenticate } from "../auth/auth.middleware";
import { uploadXrayAssets } from "./xrays.controller";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 18 },
});

router.post(
  "/visits/:visitId/xray-assets",
  authenticate,
  upload.array("files[]", 18),
  uploadXrayAssets
);

export default router;
