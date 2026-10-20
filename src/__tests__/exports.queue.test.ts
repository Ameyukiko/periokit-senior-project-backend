import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/env", () => ({
  env: {
    EXPORT_MAX_CONCURRENCY: 2,
    EXPORT_MAX_QUEUE: 10,
    EXPORT_TIMEOUT_MS: 60000,
  },
}));
import { ExportError } from "../modules/exports/exports.errors";
import { ExportQueue } from "../modules/exports/exports.queue";

describe("export queue", () => {
  it("limits concurrency and rejects work beyond queue capacity", async () => {
    const queue = new ExportQueue(1, 1, 1000);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const first = queue.run(async () => { await gate; return "first"; }, new AbortController().signal);
    const second = queue.run(async () => "second", new AbortController().signal);

    expect(queue.stats).toMatchObject({ active: 1, queued: 1, willQueue: true });
    expect(() => queue.run(async () => "third", new AbortController().signal)).toThrowError(
      expect.objectContaining({ code: "EXPORT_QUEUE_FULL", statusCode: 429 })
    );

    release();
    await expect(first).resolves.toBe("first");
    await expect(second).resolves.toBe("second");
  });

  it("removes a queued job when the client cancels", async () => {
    const queue = new ExportQueue(1, 1, 1000);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const first = queue.run(async () => { await gate; }, new AbortController().signal);
    const controller = new AbortController();
    const queued = queue.run(async () => "never", controller.signal);
    controller.abort();

    await expect(queued).rejects.toMatchObject({ code: "EXPORT_CANCELLED" });
    expect(queue.stats.queued).toBe(0);
    release();
    await first;
  });

  it("returns a typed timeout even when a task ignores the signal", async () => {
    const queue = new ExportQueue(1, 0, 10);
    const result = queue.run(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return "late";
      },
      new AbortController().signal
    );

    await expect(result).rejects.toEqual(
      expect.objectContaining<Partial<ExportError>>({ code: "EXPORT_TIMEOUT", statusCode: 504 })
    );
  });

  it("keeps interactive source work independent from saturated final exports", async () => {
    const finalQueue = new ExportQueue(1, 1, 1000);
    const sourceQueue = new ExportQueue(1, 1, 1000);
    let releaseFinal!: () => void;
    const finalGate = new Promise<void>((resolve) => { releaseFinal = resolve; });
    const final = finalQueue.run(
      async () => { await finalGate; return "final"; },
      new AbortController().signal
    );
    const queuedFinal = finalQueue.run(
      async () => "queued-final",
      new AbortController().signal
    );

    await expect(
      sourceQueue.run(async () => "source", new AbortController().signal)
    ).resolves.toBe("source");
    expect(finalQueue.stats).toMatchObject({ active: 1, queued: 1 });

    releaseFinal();
    await expect(final).resolves.toBe("final");
    await expect(queuedFinal).resolves.toBe("queued-final");
  });
});
