export type ExportErrorCode =
  | "INVALID_EXPORT_REQUEST"
  | "AUTHENTICATION_REQUIRED"
  | "VISIT_NOT_FOUND"
  | "EXPORT_SOURCE_CHANGED"
  | "EXPORT_DATA_UNAVAILABLE"
  | "EXPORT_ASSET_UNAVAILABLE"
  | "EXPORT_LIMIT_EXCEEDED"
  | "EXPORT_QUEUE_FULL"
  | "EXPORT_TIMEOUT"
  | "EXPORT_CANCELLED";

export class ExportError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ExportErrorCode,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ExportError";
  }
}

export const throwIfAborted = (signal: AbortSignal) => {
  if (signal.aborted) {
    const reason = signal.reason;
    if (reason instanceof ExportError) throw reason;
    throw new ExportError(499, "EXPORT_CANCELLED", "Export was cancelled");
  }
};
