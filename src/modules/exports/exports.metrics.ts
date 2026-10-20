export class ExportTimings {
  private readonly startedAt = performance.now();
  private readonly stages = new Map<string, number>();

  async measure<T>(stage: string, work: () => Promise<T>): Promise<T> {
    const startedAt = performance.now();
    try {
      return await work();
    } finally {
      this.stages.set(stage, (this.stages.get(stage) ?? 0) + performance.now() - startedAt);
    }
  }

  add(stage: string, durationMs: number) {
    this.stages.set(stage, (this.stages.get(stage) ?? 0) + durationMs);
  }

  toServerTiming() {
    const parts = [...this.stages].map(
      ([stage, duration]) => `${stage};dur=${duration.toFixed(1)}`
    );
    parts.push(`total;dur=${(performance.now() - this.startedAt).toFixed(1)}`);
    return parts.join(", ");
  }
}
