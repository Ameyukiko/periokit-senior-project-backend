import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { buildExportRenderModel } from "../modules/exports/exports.render-model";
import {
  closeSharedRendererBrowser,
  renderWithSharedView,
} from "../modules/exports/exports.shared-renderer";
import type { PreviewExportRequest } from "../modules/exports/exports.contract";
import { exportSnapshotFixture } from "./exports.fixture";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve()))
    )
  );
});

afterAll(closeSharedRendererBrowser);

const startRenderer = async (statusScript: string, extraCss = "") => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html><html><head><style>
      [data-export-page-id] { box-sizing: border-box; background: white; color: #1e293b; }
      ${extraCss}
    </style></head><body><script>
      const input = window.__PERIOKIT_EXPORT_INPUT__;
      document.body.insertAdjacentHTML("afterbegin", input.pages.map((page) =>
        '<main data-export-page-id="' + page.id + '"><h1>' + page.title + '</h1><span>' + input.patient.hn + '</span></main>'
      ).join(""));
      ${statusScript}
    </script></body></html>`);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}/export/render`;
};

const renderModel = () => {
  const request: PreviewExportRequest = {
    format: "pdf",
    sections: ["chart", "diagnosis"],
    paperSize: "a4",
    orientations: {},
    grayscale: false,
    baseFilename: "report",
  };
  return buildExportRenderModel(
    exportSnapshotFixture(),
    request,
    new Map(),
    "2026-10-19T07:00:00.000Z"
  );
};

describe("shared frontend export renderer", () => {
  it("injects the render model and captures self-contained page images", async () => {
    const url = await startRenderer(
      'window.__PERIOKIT_EXPORT_STATUS__ = { state: "ready", protocolVersion: input.protocolVersion };'
    );
    const report = await renderWithSharedView(
      renderModel(),
      url,
      5000,
      new AbortController().signal
    );

    expect(report.pages).toHaveLength(2);
    expect(report.pages[0]).toMatchObject({
      id: "1-chart",
      section: "chart",
      widthMm: 297,
      heightMm: 210,
    });
    expect(report.pages[0].html).toContain('src="data:image/png;base64,');
    expect(report.pages[0].html).toContain('alt="Periodontal chart"');
    expect(report.pages[0].html).not.toContain("<script");
    expect(report.pages[0].html).toContain("default-src 'none'");
  }, 15000);

  it("rejects an incompatible renderer protocol", async () => {
    const url = await startRenderer(
      'window.__PERIOKIT_EXPORT_STATUS__ = { state: "ready", protocolVersion: "999" };'
    );

    await expect(
      renderWithSharedView(renderModel(), url, 5000, new AbortController().signal)
    ).rejects.toMatchObject({ code: "EXPORT_RENDERER_VERSION_MISMATCH", statusCode: 422 });
  }, 15000);

  it("does not expose arbitrary renderer errors", async () => {
    const url = await startRenderer(
      'window.__PERIOKIT_EXPORT_STATUS__ = { state: "error", code: "patient Ada failed" };'
    );

    await expect(
      renderWithSharedView(renderModel(), url, 5000, new AbortController().signal)
    ).rejects.toMatchObject({
      code: "EXPORT_RENDER_FAILED",
      details: { rendererCode: "RENDERER_REPORTED_ERROR" },
    });
  }, 15000);

  it("does not carry external stylesheet assets into the captured output", async () => {
    const url = await startRenderer(
      'window.__PERIOKIT_EXPORT_STATUS__ = { state: "ready", protocolVersion: input.protocolVersion };',
      '[data-export-page-id] { background-image: url("/private-background.png"); }'
    );

    const report = await renderWithSharedView(
      renderModel(), url, 5000, new AbortController().signal
    );
    expect(report.pages[0].html).toContain("data:image/png;base64,");
    expect(report.pages[0].html).not.toContain("private-background.png");
  }, 15000);

  it("times out when the renderer never becomes ready", async () => {
    const url = await startRenderer(
      'window.__PERIOKIT_EXPORT_STATUS__ = { state: "loading", protocolVersion: input.protocolVersion };'
    );

    await expect(
      renderWithSharedView(renderModel(), url, 200, new AbortController().signal)
    ).rejects.toMatchObject({ code: "EXPORT_RENDER_TIMEOUT", statusCode: 504 });
  }, 15000);

  it("closes rendering when the caller cancels", async () => {
    const url = await startRenderer(
      'window.__PERIOKIT_EXPORT_STATUS__ = { state: "loading", protocolVersion: input.protocolVersion };'
    );
    const controller = new AbortController();
    const rendering = renderWithSharedView(renderModel(), url, 5000, controller.signal);
    setTimeout(() => controller.abort(), 100);

    await expect(rendering).rejects.toMatchObject({ code: "EXPORT_CANCELLED", statusCode: 499 });
  }, 15000);
});
