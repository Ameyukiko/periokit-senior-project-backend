import { describe, expect, it, vi } from "vitest";
import { ExportTimings } from "../modules/exports/exports.metrics";

describe("ExportTimings", () => {
  it("emits aggregate stages in a Server-Timing header", async () => {
    vi.spyOn(performance, "now")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(2)
      .mockReturnValueOnce(7)
      .mockReturnValueOnce(10);
    const timings = new ExportTimings();

    await timings.measure("snapshot", async () => "ok");
    timings.add("queue", 2.25);

    expect(timings.toServerTiming()).toBe(
      "snapshot;dur=5.0, queue;dur=2.3, total;dur=10.0"
    );
    vi.restoreAllMocks();
  });
});
