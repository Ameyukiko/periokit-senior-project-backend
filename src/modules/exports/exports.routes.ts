import { Router } from "express";
import { authenticate } from "../auth/auth.middleware";
import { createExport, exportSource, previewExport } from "./exports.controller";

const router = Router();

router.get("/visits/:visitId/exports/source", authenticate, exportSource);
router.post("/visits/:visitId/exports/preview", authenticate, previewExport);
router.post("/visits/:visitId/exports", authenticate, createExport);

export default router;
