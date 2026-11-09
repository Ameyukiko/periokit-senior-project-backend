# Export API contract

All endpoints require `Authorization: Bearer <access-token>`. A visit that does
not exist or is not owned by the authenticated dentist returns `404` so that
resource ownership is not disclosed.

## Preview source

`GET /visits/:visitId/exports/source`

Returns the authorized saved snapshot, section availability, renderer version,
and self-contained preview image assets. The frontend loads this response once
per visit and applies paper, orientation, section, and grayscale changes
locally. Storage paths, filenames, credentials, and authorization tokens are
not included.

## Preview

`POST /visits/:visitId/exports/preview`

```json
{
  "format": "pdf",
  "sections": ["chart", "diagnosis", "images", "imageNotes", "notes"],
  "paperSize": "a4",
  "orientations": {
    "chart": "landscape",
    "diagnosis": "portrait",
    "images": "landscape"
  },
  "grayscale": false,
  "baseFilename": "periodontal-report"
}
```

Allowed values:

- `format`: `pdf`, `png`, `excel`
- `sections`: `chart`, `diagnosis`, `images`, `imageNotes`, `notes`
- `paperSize`: `a3`, `a4`, `a5`, `b4`, `b5`, `jis-b4`, `jis-b5`,
  `letter`, `legal`, `tabloid`, `executive`
- orientation: `portrait`, `landscape`
- `pngDpi`: required for PNG and must be `96`, `150`, or `300`; omit for PDF/Excel

Patient/HN, visit date, clinician, generated time and page number are mandatory
report headers and do not need to be selected. `baseFilename` is sanitized by
the backend.

Successful response:

```json
{
  "snapshotVersion": "base64url-sha256-version",
  "rendererVersion": "1.0",
  "availability": {
    "chart": { "available": true, "reason": null },
    "images": { "available": true, "reason": null },
    "imageNotes": { "available": true, "reason": null }
  },
  "pageCount": 5,
  "pages": [
    {
      "id": "1-chart",
      "section": "chart",
      "title": "Periodontal chart",
      "pageNumber": 1,
      "widthMm": 297,
      "heightMm": 210,
      "orientation": "landscape",
      "html": "<!doctype html>..."
    }
  ],
  "warnings": []
}
```

The HTML contains no scripts or external resources and is intended for a
sandboxed iframe. The frontend must treat it as opaque preview content.
`rendererVersion` is `legacy` until `EXPORT_RENDERER_URL` is configured, then
it is the shared renderer protocol version.

The current database does not classify stored images as X-ray versus intraoral.
For that reason every active visit image is exposed through the single `images`
section. Notes saved on the same image board are exposed as `imageNotes`.

## Download

`POST /visits/:visitId/exports`

Use the same body as preview and add the exact version returned by preview:

```json
{
  "format": "png",
  "sections": ["chart"],
  "paperSize": "a4",
  "orientations": { "chart": "landscape" },
  "grayscale": false,
  "pngDpi": 150,
  "baseFilename": "periodontal-report",
  "expectedSnapshotVersion": "base64url-sha256-version",
  "expectedRendererVersion": "1.0"
}
```

When the shared renderer is enabled, `expectedRendererVersion` is required and
must exactly match the value returned by preview. During legacy fallback it is
optional.

The response is a streamed binary with `Content-Type`, `Content-Length`, and a
safe RFC 5987 `Content-Disposition`. PDF and XLSX are returned directly. PNG is
returned directly for one page and as ZIP for multiple pages.

## Errors

```json
{
  "success": false,
  "code": "EXPORT_SOURCE_CHANGED",
  "message": "The saved visit changed after the preview was generated",
  "details": {}
}
```

| HTTP | Code | Meaning |
| --- | --- | --- |
| 400 | `INVALID_EXPORT_REQUEST` | Request failed schema or conditional validation |
| 401 | `AUTHENTICATION_REQUIRED` | Bearer token is missing/invalid (normally returned by auth middleware) |
| 404 | `VISIT_NOT_FOUND` | Visit is missing or not owned by the authenticated user |
| 409 | `EXPORT_SOURCE_CHANGED` | Saved data changed after preview; refresh preview |
| 409 | `EXPORT_RENDERER_CHANGED` | Renderer changed after preview; refresh preview |
| 422 | `EXPORT_DATA_UNAVAILABLE` | A selected section has no saved data |
| 422 | `EXPORT_ASSET_UNAVAILABLE` | A selected image is missing or unreadable |
| 422 | `EXPORT_LIMIT_EXCEEDED` | Page, asset, or source-byte limit exceeded |
| 422 | `EXPORT_RENDER_FAILED` | Shared renderer reported a safe render error |
| 422 | `EXPORT_RENDERER_EXTERNAL_ASSET` | Renderer output depends on a remote CSS asset |
| 422 | `EXPORT_RENDERER_OUTPUT_INVALID` | Renderer omitted one or more requested pages |
| 422 | `EXPORT_RENDERER_VERSION_MISMATCH` | Frontend renderer protocol is incompatible |
| 429 | `EXPORT_QUEUE_FULL` | Two jobs are active and ten jobs are already queued |
| 499 | `EXPORT_CANCELLED` | Client disconnected before completion |
| 504 | `EXPORT_TIMEOUT` | Generation exceeded 60 seconds |
| 504 | `EXPORT_RENDER_TIMEOUT` | Shared renderer did not become ready in time |

`X-Export-Queue-Status` is `queued` or `preparing`. A disconnect cancels queued
work and closes an active Chromium context. Export files are held in memory and
are not written to the database, local disk, or Supabase Storage.

The shared Chromium process is reused across jobs, while every job receives an
isolated browser context that is closed on completion or cancellation. Shared
renderer PDF files are printed directly from the frontend DOM, and PNG files
are captured directly at the requested DPI. The intermediate screenshot HTML
and second Chromium pass are skipped. Legacy and fallback preview renders are
kept in a user/visit/snapshot-scoped in-memory LRU cache for 30 seconds by
default. The cache is bounded to 64 MB and never bypasses the fresh
snapshot/ownership check. Configure these limits with
`EXPORT_RENDER_CACHE_TTL_MS` and `EXPORT_RENDER_CACHE_MAX_BYTES`.

The shared print-renderer integration is documented in
[`EXPORT_RENDERER_PROTOCOL.md`](./EXPORT_RENDERER_PROTOCOL.md).
