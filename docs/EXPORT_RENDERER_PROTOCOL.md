# Shared export renderer protocol

Protocol version: `1.0`

The frontend owns the visual report component. The backend remains responsible
for authorization, immutable saved data, image retrieval, snapshot consistency,
Playwright execution, and binary file generation.

## Renderer entry point

Set `EXPORT_RENDERER_URL` to an HTTP(S) page dedicated to export rendering, for
example `http://localhost:5173/export/render`. The configured URL must not have
credentials, a query string, or a fragment. When it is unset, the backend uses
the legacy renderer so local development remains functional during migration.

The backend allows the renderer page and static assets from that exact origin.
All other browser network requests are blocked. The renderer must not use a CDN
or fetch Supabase directly.

## Input

Before any frontend script runs, Playwright defines the following read-only
global property:

```ts
window.__PERIOKIT_EXPORT_INPUT__: ExportRenderModel
```

The model contains:

- `protocolVersion`, `snapshotVersion`, and backend `generatedAt`
- format, paper size, grayscale, page dimensions, and orientation
- saved patient, visit, periodontal chart, diagnosis, and image-board data
- selected image assets as backend-created `data:` URLs

It intentionally excludes storage paths, original filenames, the requested
download filename, credentials, and authorization tokens. Data must never be
copied into the renderer URL, browser logs, or telemetry.

The canonical TypeScript contract is
`src/modules/exports/exports.render-model.ts`. Frontend should mirror or consume
that contract and reject unsupported versions.

## Output DOM

Render exactly one root element for every requested page:

```html
<main data-export-page-id="1-chart">...</main>
```

The ID must exactly equal the corresponding `model.pages[].id`. Page CSS and
fonts must be bundled locally or inlined. Images should use the `data:` URLs
provided in `model.imageBoard.assets`.

The backend extracts each page and produces script-free standalone HTML with a
restrictive Content Security Policy. Script, iframe, object, embed, link, event
handler, nonce, and `javascript:` content is removed from preview output.

## Readiness handshake

The renderer owns this status global:

```ts
window.__PERIOKIT_EXPORT_STATUS__ = {
  state: "loading" | "ready" | "error",
  protocolVersion: "1.0",
  code?: "SAFE_MACHINE_READABLE_CODE"
}
```

Set `ready` only after the component DOM is final. The backend then additionally
waits for `document.fonts.ready` and every image to load and decode.

On failure, set `state: "error"` with an uppercase machine-readable code. Do not
put patient data or free-form clinical text in the code. Unsafe codes are
replaced by `RENDERER_REPORTED_ERROR` before they can appear in an API response.

## Compatibility and failure behavior

- Protocol mismatch returns `422 EXPORT_RENDERER_VERSION_MISMATCH`.
- Missing page roots return `422 EXPORT_RENDERER_OUTPUT_INVALID`.
- Remote assets in extracted CSS return `422 EXPORT_RENDERER_EXTERNAL_ASSET`.
- A renderer-reported failure returns `422 EXPORT_RENDER_FAILED`.
- Readiness timeout returns `504 EXPORT_RENDER_TIMEOUT`.
- Client cancellation closes the browser context.

Preview and PDF/PNG generation pass through this same adapter. Final PDFs are
printed directly from each page DOM and merged without an intermediate raster
HTML pass. PNG pages are captured directly at the requested DPI and packaged
without launching another Chromium process. Excel remains a backend-only
`exceljs` export and does not invoke the shared renderer.

Preview responses include `rendererVersion`. When the shared renderer is
enabled, the download request must return that exact value as
`expectedRendererVersion`; otherwise the backend returns
`409 EXPORT_RENDERER_CHANGED` and the client must refresh preview.
