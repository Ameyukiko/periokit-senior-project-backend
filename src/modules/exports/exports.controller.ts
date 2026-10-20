import type { Request, Response } from "express";
import { ZodError } from "zod";
import {
  createExportRequestSchema,
  previewExportRequestSchema,
  visitIdParamSchema,
} from "./exports.contract";
import { ExportError } from "./exports.errors";
import { contentDisposition } from "./exports.generator";
import { ExportTimings } from "./exports.metrics";
import { finalExportQueue, sourceExportQueue } from "./exports.queue";
import { createVisitExport, getVisitExportSource, previewVisitExport } from "./exports.service";

const requestAbortSignal = (req: Request, res: Response) => {
  const controller = new AbortController();
  const abort = () => controller.abort(new ExportError(499, "EXPORT_CANCELLED", "Export was cancelled"));
  req.once("aborted", abort);
  res.once("close", () => {
    if (!res.writableEnded) abort();
  });
  return controller.signal;
};

const sendError = (res: Response, error: unknown) => {
  if (res.headersSent || res.destroyed) return;
  if (error instanceof ExportError) {
    res.status(error.statusCode).json({
      success: false,
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    });
    return;
  }
  if (error instanceof ZodError) {
    res.status(400).json({
      success: false,
      code: "INVALID_EXPORT_REQUEST",
      message: "Invalid export request",
      details: { issues: error.issues },
    });
    return;
  }

  console.error("Export request failed", {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : "Unknown export error",
  });
  res.status(500).json({
    success: false,
    code: "EXPORT_FAILED",
    message: "The export could not be generated",
  });
};

const parseVisitId = (req: Request) => visitIdParamSchema.parse(req.params).visitId;
const requireUserId = (req: Request) => {
  const userId = req.auth?.user.id;
  if (!userId) {
    throw new ExportError(401, "AUTHENTICATION_REQUIRED", "Authentication required");
  }
  return userId;
};

export const previewExport = async (req: Request, res: Response) => {
  const timings = new ExportTimings();
  try {
    const visitId = parseVisitId(req);
    const userId = requireUserId(req);
    const input = previewExportRequestSchema.parse(req.body);
    const signal = requestAbortSignal(req, res);
    const queued = sourceExportQueue.stats.willQueue;
    res.setHeader("X-Export-Queue-Status", queued ? "queued" : "preparing");
    const queuedAt = performance.now();
    const preview = await sourceExportQueue.run(
      (jobSignal) => {
        timings.add("queue", performance.now() - queuedAt);
        return previewVisitExport(visitId, userId, input, jobSignal, timings);
      },
      signal
    );
    if (!signal.aborted) {
      res.setHeader("Server-Timing", timings.toServerTiming());
      res.status(200).json(preview);
    }
  } catch (error) {
    sendError(res, error);
  }
};

export const exportSource = async (req: Request, res: Response) => {
  const timings = new ExportTimings();
  try {
    const visitId = parseVisitId(req);
    const userId = requireUserId(req);
    const signal = requestAbortSignal(req, res);
    const queued = sourceExportQueue.stats.willQueue;
    res.setHeader("X-Export-Queue-Status", queued ? "queued" : "preparing");
    const queuedAt = performance.now();
    const source = await sourceExportQueue.run(
      (jobSignal) => {
        timings.add("queue", performance.now() - queuedAt);
        return getVisitExportSource(visitId, userId, jobSignal, timings);
      },
      signal
    );
    if (!signal.aborted) {
      res.setHeader("Server-Timing", timings.toServerTiming());
      res.status(200).json(source);
    }
  } catch (error) {
    sendError(res, error);
  }
};

export const createExport = async (req: Request, res: Response) => {
  const timings = new ExportTimings();
  try {
    const visitId = parseVisitId(req);
    const userId = requireUserId(req);
    const input = createExportRequestSchema.parse(req.body);
    const signal = requestAbortSignal(req, res);
    const queued = finalExportQueue.stats.willQueue;
    res.setHeader("X-Export-Queue-Status", queued ? "queued" : "preparing");
    const queuedAt = performance.now();
    const generated = await finalExportQueue.run(
      (jobSignal) => {
        timings.add("queue", performance.now() - queuedAt);
        return createVisitExport(visitId, userId, input, jobSignal, timings);
      },
      signal
    );
    if (signal.aborted) return;

    res.setHeader("Content-Type", generated.contentType);
    res.setHeader("Content-Length", String(generated.body.length));
    res.setHeader("Content-Disposition", contentDisposition(generated.filename));
    res.setHeader("Server-Timing", timings.toServerTiming());
    res.status(200).end(generated.body);
  } catch (error) {
    sendError(res, error);
  }
};
