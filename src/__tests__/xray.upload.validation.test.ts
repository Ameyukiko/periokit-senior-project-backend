import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/env", () => ({
  env: {
    SUPABASE_XRAY_BUCKET: "xray-images",
    SUPABASE_XRAY_MAX_FILE_SIZE_BYTES: 10485760,
    SUPABASE_XRAY_MAX_PIXELS: 50000000,
  },
}));
vi.mock("../lib/supabase", () => ({ supabaseAdmin: {} }));
vi.mock("../modules/xrays/xrays.repository", () => ({ xraysRepository: {} }));
vi.mock("../graphql/modules/xray.graphql", () => ({ toXrayAssets: vi.fn() }));
import {
  findDuplicateUploadIds,
  isValidXrayUploadId,
} from "../modules/xrays/xrays.controller";

describe("X-ray upload validation", () => {
  it("accepts valid UUID upload IDs", () => {
    expect(isValidXrayUploadId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("rejects malformed upload IDs", () => {
    expect(isValidXrayUploadId("not-a-uuid")).toBe(false);
    expect(isValidXrayUploadId("550e8400-e29b-41d4-a716-44665544000")).toBe(false);
  });

  it("finds duplicate upload IDs", () => {
    expect(
      findDuplicateUploadIds([
        "550e8400-e29b-41d4-a716-446655440000",
        "550e8400-e29b-41d4-a716-446655440000",
        "6ba7b810-9dad-41d1-80b4-00c04fd430c8",
      ])
    ).toEqual(["550e8400-e29b-41d4-a716-446655440000"]);
  });
});
