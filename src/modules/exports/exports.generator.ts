import { Buffer } from "node:buffer";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import sharp from "sharp";
import type { CreateExportRequest } from "./exports.contract";
import { throwIfAborted } from "./exports.errors";
import type { RenderedPage } from "./exports.renderer";
import type { ExportSnapshot } from "./exports.snapshot";
import { buildClinicalChartWorksheet } from "./exports.excel-chart";

export type GeneratedExport = {
  body: Buffer;
  contentType: string;
  filename: string;
};

const extensionFor = (format: CreateExportRequest["format"], pageCount: number) => {
  if (format === "pdf") return "pdf";
  if (format === "excel") return "xlsx";
  return pageCount === 1 ? "png" : "zip";
};

const setPageContent = async (page: Page, reportPage: RenderedPage) => {
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.startsWith("data:") || url === "about:blank") await route.continue();
    else await route.abort();
  });
  await page.setContent(reportPage.html, { waitUntil: "load" });
  await page.emulateMedia({ media: "print" });
};

const withBrowser = async <T>(
  signal: AbortSignal,
  work: (browser: Browser, context: BrowserContext) => Promise<T>,
  contextOptions: Parameters<Browser["newContext"]>[0] = { javaScriptEnabled: false }
) => {
  throwIfAborted(signal);
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  const closeContext = () => {
    if (context) void context.close().catch(() => undefined);
  };
  signal.addEventListener("abort", closeContext, { once: true });
  try {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext(contextOptions);
    throwIfAborted(signal);
    return await work(browser, context);
  } catch (error) {
    if (signal.aborted) throwIfAborted(signal);
    throw error;
  } finally {
    signal.removeEventListener("abort", closeContext);
    if (context) await context.close().catch(() => undefined);
    if (browser) await browser.close().catch(() => undefined);
  }
};

const generatePdf = async (pages: RenderedPage[], signal: AbortSignal) =>
  withBrowser(signal, async (_browser, context) => {
    const output = await PDFDocument.create();
    for (const reportPage of pages) {
      throwIfAborted(signal);
      const page = await context.newPage();
      try {
        await setPageContent(page, reportPage);
        const pdfBytes = await page.pdf({
          width: `${reportPage.widthMm}mm`,
          height: `${reportPage.heightMm}mm`,
          printBackground: true,
          margin: { top: "0", right: "0", bottom: "0", left: "0" },
          preferCSSPageSize: true,
        });
        const source = await PDFDocument.load(pdfBytes);
        const copied = await output.copyPages(source, source.getPageIndices());
        copied.forEach((pdfPage) => output.addPage(pdfPage));
      } finally {
        await page.close().catch(() => undefined);
      }
    }
    return Buffer.from(await output.save({ useObjectStreams: false }));
  });

const renderPngs = async (
  pages: RenderedPage[],
  dpi: 96 | 150 | 300,
  signal: AbortSignal
) =>
  withBrowser(signal, async (_browser, context) => {
    const images: Array<{ page: RenderedPage; data: Buffer }> = [];
    for (const reportPage of pages) {
      throwIfAborted(signal);
      const cssWidth = Math.max(1, Math.round((reportPage.widthMm / 25.4) * 96));
      const cssHeight = Math.max(1, Math.round((reportPage.heightMm / 25.4) * 96));
      const page = await context.newPage();
      try {
        await page.setViewportSize({ width: cssWidth, height: cssHeight });
        await setPageContent(page, reportPage);
        const screenshot = await page.screenshot({
          type: "png",
          fullPage: false,
          animations: "disabled",
          caret: "hide",
        });
        const pixelWidth = Math.round((reportPage.widthMm / 25.4) * dpi);
        const pixelHeight = Math.round((reportPage.heightMm / 25.4) * dpi);
        const exact = await sharp(screenshot)
          .resize(pixelWidth, pixelHeight, { fit: "fill" })
          .png({ compressionLevel: 9 })
          .withMetadata({ density: dpi })
          .toBuffer();
        images.push({ page: reportPage, data: exact });
      } finally {
        await page.close().catch(() => undefined);
      }
    }
    return images;
  }, { javaScriptEnabled: false, deviceScaleFactor: dpi / 96 });

const generateExcel = async (
  snapshot: ExportSnapshot,
  signal: AbortSignal,
  includePatientDetails: boolean,
) => {
  throwIfAborted(signal);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "PerioKit";
  workbook.created = new Date(0);
  workbook.modified = new Date(0);
  workbook.calcProperties.fullCalcOnLoad = true;

  buildClinicalChartWorksheet(workbook, snapshot, includePatientDetails);

  throwIfAborted(signal);
  return Buffer.from(await workbook.xlsx.writeBuffer());
};

export const generateExport = async (
  snapshot: ExportSnapshot,
  request: CreateExportRequest,
  pages: RenderedPage[],
  signal: AbortSignal
): Promise<GeneratedExport> => {
  let body: Buffer;
  if (request.format === "pdf") {
    body = await generatePdf(pages, signal);
  } else if (request.format === "excel") {
    body = await generateExcel(snapshot, signal, request.includePatientDetails !== false);
  } else {
    const images = await renderPngs(pages, request.pngDpi!, signal);
    if (images.length === 1) {
      body = images[0].data;
    } else {
      const zip = new JSZip();
      images.forEach(({ page, data }, index) => {
        zip.file(
          `${request.baseFilename}-${String(index + 1).padStart(2, "0")}-${page.section}.png`,
          data
        );
      });
      body = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    }
  }

  throwIfAborted(signal);
  const extension = extensionFor(request.format, pages.length);
  return {
    body,
    filename: `${request.baseFilename}.${extension}`,
    contentType:
      extension === "pdf"
        ? "application/pdf"
        : extension === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : extension === "zip"
            ? "application/zip"
            : "image/png",
  };
};

export const contentDisposition = (filename: string) => {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
};
