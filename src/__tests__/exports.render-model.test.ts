import { describe, expect, it } from "vitest";
import { buildExportRenderModel } from "../modules/exports/exports.render-model";
import type { PreviewExportRequest } from "../modules/exports/exports.contract";
import { exportSnapshotFixture } from "./exports.fixture";

describe("export render model", () => {
  it("projects a trusted snapshot into the shared renderer contract", () => {
    const snapshot = exportSnapshotFixture();
    snapshot.xray!.assets.push({
      id: "asset-1",
      storagePath: "private/patient-1/source.jpg",
      fileName: "source.jpg",
      mimeType: "image/jpeg",
      fileSize: 100,
      naturalWidth: 1200,
      naturalHeight: 800,
      status: "active",
      updatedAt: "2026-10-19T00:00:00.000Z",
    });
    const request: PreviewExportRequest = {
      format: "pdf",
      sections: ["chart", "images"],
      paperSize: "a4",
      orientations: { chart: "portrait", images: "landscape" },
      grayscale: false,
      baseFilename: "report",
    };

    const model = buildExportRenderModel(
      snapshot,
      request,
      new Map([["asset-1", "data:image/jpeg;base64,c2FmZQ=="]]),
      "2026-10-19T07:00:00.000Z"
    );

    expect(model).toMatchObject({
      protocolVersion: "1.0",
      snapshotVersion: snapshot.snapshotVersion,
      generatedAt: "2026-10-19T07:00:00.000Z",
      options: { format: "pdf", paperSize: "a4", grayscale: false },
      patient: { hn: "00123" },
      pages: [
        { id: "1-chart", widthMm: 210, heightMm: 297, orientation: "portrait" },
        { id: "2-images", widthMm: 297, heightMm: 210, orientation: "landscape" },
      ],
      imageBoard: {
        assets: [
          {
            id: "asset-1",
            source: "data:image/jpeg;base64,c2FmZQ==",
            naturalWidth: 1200,
            naturalHeight: 800,
          },
        ],
      },
    });
    const serialized = JSON.stringify(model);
    expect(serialized).not.toContain("private/patient-1/source.jpg");
    expect(serialized).not.toContain('"fileName"');
    expect(serialized).not.toContain('"baseFilename"');
  });
});
