import { Buffer } from "node:buffer";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { chromium, errors as playwrightErrors, type Browser, type BrowserContext, type Page } from "playwright";
import sharp from "sharp";
import type { CreateExportRequest } from "./exports.contract";
import { ExportError, throwIfAborted } from "./exports.errors";
import type { GeneratedExport } from "./exports.generator";
import {
  EXPORT_RENDERER_PROTOCOL_VERSION,
  type ExportRenderModel,
} from "./exports.render-model";
import type { RenderedPage, RenderedReport } from "./exports.renderer";
import type { RenderQuality } from "./exports.render-cache";

type RendererStatus = {
  state: "loading" | "ready" | "error";
  protocolVersion?: string;
  code?: string;
};

type RendererGlobals = typeof globalThis & {
  __PERIOKIT_EXPORT_INPUT__?: ExportRenderModel;
  __PERIOKIT_EXPORT_STATUS__?: RendererStatus;
};

const ALLOWED_RENDERER_RESOURCE_TYPES = new Set([
  "document",
  "script",
  "stylesheet",
  "font",
  "image",
]);

let sharedBrowser: Browser | null = null;
let browserLaunch: Promise<Browser> | null = null;

const getSharedBrowser = async () => {
  if (sharedBrowser?.isConnected()) return sharedBrowser;
  if (!browserLaunch) {
    browserLaunch = chromium.launch({ headless: true }).then((browser) => {
      sharedBrowser = browser;
      browser.on("disconnected", () => {
        if (sharedBrowser === browser) sharedBrowser = null;
      });
      return browser;
    }).finally(() => {
      browserLaunch = null;
    });
  }
  return browserLaunch;
};

export const closeSharedRendererBrowser = async () => {
  const launching = browserLaunch;
  const browser = sharedBrowser ?? (launching ? await launching.catch(() => null) : null);
  sharedBrowser = null;
  if (browser) await browser.close().catch(() => undefined);
};

const safeRendererErrorCode = (value: unknown) =>
  typeof value === "string" && /^[A-Z0-9_]{1,64}$/.test(value)
    ? value
    : "RENDERER_REPORTED_ERROR";

const parseRendererUrl = (value: string) => {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new ExportError(500, "EXPORT_RENDERER_CONFIG_INVALID", "Invalid export renderer configuration");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new ExportError(500, "EXPORT_RENDERER_CONFIG_INVALID", "Invalid export renderer configuration");
  }
  return url;
};

const closeOnAbort = (
  signal: AbortSignal,
  getContext: () => BrowserContext | null
) => {
  const abort = () => {
    const context = getContext();
    if (context) void context.close().catch(() => undefined);
  };
  signal.addEventListener("abort", abort, { once: true });
  return () => signal.removeEventListener("abort", abort);
};

const extractSelfContainedPages = async (
  page: import("playwright").Page,
  model: ExportRenderModel
): Promise<RenderedPage[]> => {
  const rendered: RenderedPage[] = [];
  for (const pageModel of model.pages) {
    const locator = page.locator(`[data-export-page-id="${pageModel.id}"]`);
    if (await locator.count() !== 1) {
      throw new ExportError(
        422,
        "EXPORT_RENDERER_OUTPUT_INVALID",
        "The report renderer returned incomplete output",
        { pageId: pageModel.id }
      );
    }

    // Capture the frontend-rendered pixels rather than serializing form DOM.
    // Serializing loses live input values and allows iframe media queries to
    // reflow the chart differently from the renderer viewport.
    const screenshot = await locator.screenshot({
      type: "png",
      animations: "disabled",
      caret: "hide",
    });
    const source = `data:image/png;base64,${screenshot.toString("base64")}`;
    const contentSecurityPolicy = [
      "default-src 'none'",
      "img-src data:",
      "style-src 'unsafe-inline'",
    ].join("; ");
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@page{size:${pageModel.widthMm}mm ${pageModel.heightMm}mm;margin:0}html,body,main,img{display:block;margin:0;width:100%;height:100%;overflow:hidden}img{object-fit:fill}</style></head><body><main data-export-page-id="${pageModel.id}"><img alt="${pageModel.title}" src="${source}"></main></body></html>`;
    rendered.push({
      id: pageModel.id,
      section: pageModel.section,
      title: pageModel.title,
      pageNumber: pageModel.pageNumber,
      widthMm: pageModel.widthMm,
      heightMm: pageModel.heightMm,
      orientation: pageModel.orientation,
      html,
    });
  }
  return rendered;
};

const withSharedView = async <T>(
  model: ExportRenderModel,
  rendererUrlValue: string,
  timeoutMs: number,
  signal: AbortSignal,
  deviceScaleFactor: number,
  work: (page: Page) => Promise<T>
): Promise<T> => {
  throwIfAborted(signal);
  const rendererUrl = parseRendererUrl(rendererUrlValue);
  let context: BrowserContext | null = null;
  const removeAbortListener = closeOnAbort(signal, () => context);

  try {
    const browser = await getSharedBrowser();
    throwIfAborted(signal);
    context = await browser.newContext({
      javaScriptEnabled: true,
      viewport: { width: 1600, height: 1200 },
      deviceScaleFactor,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);

    await page.addInitScript((input) => {
      const globals = globalThis as RendererGlobals;
      Object.defineProperty(globals, "__PERIOKIT_EXPORT_INPUT__", {
        configurable: false,
        enumerable: false,
        writable: false,
        value: input,
      });
    }, model);

    await page.route("**/*", async (route) => {
      const requestUrl = route.request().url();
      if (requestUrl.startsWith("data:") || requestUrl.startsWith("blob:") || requestUrl === "about:blank") {
        await route.continue();
        return;
      }
      try {
        if (
          new URL(requestUrl).origin === rendererUrl.origin &&
          ALLOWED_RENDERER_RESOURCE_TYPES.has(route.request().resourceType())
        ) {
          await route.continue();
          return;
        }
      } catch {
        // Invalid and non-standard URLs are blocked below.
      }
      await route.abort("blockedbyclient");
    });

    await page.goto(rendererUrl.toString(), { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForFunction(
      () => {
        const status = (globalThis as RendererGlobals).__PERIOKIT_EXPORT_STATUS__;
        return status?.state === "ready" || status?.state === "error";
      },
      undefined,
      { timeout: timeoutMs }
    );
    throwIfAborted(signal);

    const status = await page.evaluate(
      () => (globalThis as RendererGlobals).__PERIOKIT_EXPORT_STATUS__ ?? null
    );
    if (!status || status.state === "error") {
      throw new ExportError(422, "EXPORT_RENDER_FAILED", "The report renderer could not render the report", {
        rendererCode: safeRendererErrorCode(status?.code),
      });
    }
    if (status.protocolVersion !== EXPORT_RENDERER_PROTOCOL_VERSION) {
      throw new ExportError(
        422,
        "EXPORT_RENDERER_VERSION_MISMATCH",
        "The report renderer is incompatible with the backend",
        {
          expected: EXPORT_RENDERER_PROTOCOL_VERSION,
          received: status.protocolVersion ?? null,
        }
      );
    }

    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        Array.from(document.images).map(async (image) => {
          if (!image.complete) {
            await new Promise<void>((resolve, reject) => {
              image.addEventListener("load", () => resolve(), { once: true });
              image.addEventListener("error", () => reject(new Error("image_load_failed")), {
                once: true,
              });
            });
          }
          if (typeof image.decode === "function") await image.decode();
        })
      );
    });
    throwIfAborted(signal);

    const result = await work(page);
    throwIfAborted(signal);
    return result;
  } catch (error) {
    if (signal.aborted) throwIfAborted(signal);
    if (error instanceof ExportError) throw error;
    if (error instanceof playwrightErrors.TimeoutError) {
      throw new ExportError(504, "EXPORT_RENDER_TIMEOUT", "The report renderer timed out");
    }
    throw new ExportError(422, "EXPORT_RENDER_FAILED", "The report renderer could not render the report");
  } finally {
    removeAbortListener();
    if (context) await context.close().catch(() => undefined);
  }
};

export const renderWithSharedView = async (
  model: ExportRenderModel,
  rendererUrlValue: string,
  timeoutMs: number,
  signal: AbortSignal,
  quality: RenderQuality = "export"
): Promise<RenderedReport> => ({
  pages: await withSharedView(
    model,
    rendererUrlValue,
    timeoutMs,
    signal,
    quality === "preview" ? 1 : 2,
    (page) => extractSelfContainedPages(page, model)
  ),
  warnings: [],
});

const pageOnlyCss = (pageModel: ExportRenderModel["pages"][number]) => `
  @page { size: ${pageModel.widthMm}mm ${pageModel.heightMm}mm; margin: 0; }
  html, body, #app, #export-render-root { width: ${pageModel.widthMm}mm !important; height: ${pageModel.heightMm}mm !important; min-height: 0 !important; margin: 0 !important; overflow: hidden !important; }
  [data-export-page-id] { display: none !important; }
  [data-export-page-id="${pageModel.id}"] { display: block !important; margin: 0 !important; }
`;

const mergePdfPages = async (pages: Buffer[]) => {
  const output = await PDFDocument.create();
  for (const bytes of pages) {
    const source = await PDFDocument.load(bytes);
    const copied = await output.copyPages(source, source.getPageIndices());
    copied.forEach((page) => output.addPage(page));
  }
  return Buffer.from(await output.save({ useObjectStreams: false }));
};

const generatePdfDirect = async (
  page: Page,
  model: ExportRenderModel,
  signal: AbortSignal
) => {
  await page.emulateMedia({ media: "print" });
  const pdfPages: Buffer[] = [];
  for (const pageModel of model.pages) {
    throwIfAborted(signal);
    const style = await page.addStyleTag({ content: pageOnlyCss(pageModel) });
    try {
      const bytes = await page.pdf({
        width: `${pageModel.widthMm}mm`,
        height: `${pageModel.heightMm}mm`,
        printBackground: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
        preferCSSPageSize: true,
        // One render-model page is one output page. Chromium can otherwise
        // paginate a sub-pixel/form-control overflow into a stray extra page.
        pageRanges: "1",
      });
      pdfPages.push(Buffer.from(bytes));
    } finally {
      await style.evaluate((element) => element.parentNode?.removeChild(element)).catch(() => undefined);
    }
  }
  return mergePdfPages(pdfPages);
};

const generatePngsDirect = async (
  page: Page,
  model: ExportRenderModel,
  dpi: 96 | 150 | 300,
  signal: AbortSignal
) => {
  const images: Array<{ section: string; data: Buffer }> = [];
  for (const pageModel of model.pages) {
    throwIfAborted(signal);
    const locator = page.locator(`[data-export-page-id="${pageModel.id}"]`);
    if (await locator.count() !== 1) {
      throw new ExportError(
        422,
        "EXPORT_RENDERER_OUTPUT_INVALID",
        "The report renderer returned incomplete output",
        { pageId: pageModel.id }
      );
    }
    const screenshot = await locator.screenshot({
      type: "png",
      animations: "disabled",
      caret: "hide",
    });
    const pixelWidth = Math.round((pageModel.widthMm / 25.4) * dpi);
    const pixelHeight = Math.round((pageModel.heightMm / 25.4) * dpi);
    const data = await sharp(screenshot)
      .resize(pixelWidth, pixelHeight, { fit: "fill" })
      .png({ compressionLevel: 9 })
      .withMetadata({ density: dpi })
      .toBuffer();
    images.push({ section: pageModel.section, data });
  }
  return images;
};

export const generateExportWithSharedView = async (
  model: ExportRenderModel,
  request: CreateExportRequest,
  rendererUrlValue: string,
  timeoutMs: number,
  signal: AbortSignal
): Promise<GeneratedExport> => {
  if (request.format === "excel") {
    throw new ExportError(500, "EXPORT_RENDER_FAILED", "Invalid shared renderer format");
  }
  const scale = request.format === "png" ? request.pngDpi! / 96 : 1;
  return withSharedView(
    model,
    rendererUrlValue,
    timeoutMs,
    signal,
    scale,
    async (page) => {
      if (request.format === "pdf") {
        return {
          body: await generatePdfDirect(page, model, signal),
          contentType: "application/pdf",
          filename: `${request.baseFilename}.pdf`,
        };
      }

      const images = await generatePngsDirect(page, model, request.pngDpi!, signal);
      if (images.length === 1) {
        return {
          body: images[0]!.data,
          contentType: "image/png",
          filename: `${request.baseFilename}.png`,
        };
      }
      const zip = new JSZip();
      images.forEach(({ section, data }, index) => {
        zip.file(
          `${request.baseFilename}-${String(index + 1).padStart(2, "0")}-${section}.png`,
          data
        );
      });
      return {
        body: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
        contentType: "application/zip",
        filename: `${request.baseFilename}.zip`,
      };
    }
  );
};
