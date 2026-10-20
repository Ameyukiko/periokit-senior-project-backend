import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "../modules/exports/exports.concurrent";

describe("mapWithConcurrency", () => {
  it("preserves result order while respecting the concurrency limit", async () => {
    let active = 0;
    let peak = 0;
    const gates = Array.from({ length: 5 }, () => {
      let resolve!: () => void;
      const promise = new Promise<void>((done) => { resolve = done; });
      return { promise, resolve };
    });

    const pending = mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value, index) => {
      active += 1;
      peak = Math.max(peak, active);
      await gates[index]!.promise;
      active -= 1;
      return value * 10;
    });

    await Promise.resolve();
    expect(active).toBe(2);
    gates.forEach((gate) => gate.resolve());

    await expect(pending).resolves.toEqual([10, 20, 30, 40, 50]);
    expect(peak).toBe(2);
  });
});
