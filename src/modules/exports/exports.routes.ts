import { Router } from "express";
import { authenticate } from "../auth/auth.middleware";
import { createExport, previewExport } from "./exports.controller";

const router = Router();

router.post("/visits/:visitId/exports/preview", authenticate, previewExport);
router.post("/visits/:visitId/exports", authenticate, createExport);

export default router;
