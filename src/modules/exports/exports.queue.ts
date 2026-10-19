import { env } from "../../lib/env";
import { ExportError, throwIfAborted } from "./exports.errors";

type PendingJob<T> = {
  task: (signal: AbortSignal) => Promise<T>;
  clientSignal: AbortSignal;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  removeAbortListener: () => void;
};

export class ExportQueue {
  private active = 0;
  private readonly pending: PendingJob<unknown>[] = [];

  constructor(
    private readonly concurrency: number,
    private readonly maxPending: number,
    private readonly timeoutMs: number
  ) {}

  get stats() {
    return {
      active: this.active,
      queued: this.pending.length,
      willQueue: this.active >= this.concurrency,
    };
  }

  run<T>(task: (signal: AbortSignal) => Promise<T>, clientSignal: AbortSignal) {
    throwIfAborted(clientSignal);

    if (this.active < this.concurrency) {
      return this.execute(task, clientSignal);
    }
    if (this.pending.length >= this.maxPending) {
      throw new ExportError(
        429,
        "EXPORT_QUEUE_FULL",
        "The export service is busy. Please try again shortly."
      );
    }

    return new Promise<T>((resolve, reject) => {
      const onAbort = () => {
        const index = this.pending.indexOf(job as PendingJob<unknown>);
        if (index >= 0) this.pending.splice(index, 1);
        reject(new ExportError(499, "EXPORT_CANCELLED", "Export was cancelled"));
      };
      const job: PendingJob<T> = {
        task,
        clientSignal,
        resolve,
        reject,
        removeAbortListener: () => clientSignal.removeEventListener("abort", onAbort),
      };
      clientSignal.addEventListener("abort", onAbort, { once: true });
      this.pending.push(job as PendingJob<unknown>);
    });
  }

  private async execute<T>(
    task: (signal: AbortSignal) => Promise<T>,
    clientSignal: AbortSignal
  ): Promise<T> {
    this.active += 1;
    const controller = new AbortController();
    const onClientAbort = () => controller.abort(clientSignal.reason);
    clientSignal.addEventListener("abort", onClientAbort, { once: true });
    const timeout = setTimeout(
      () =>
        controller.abort(
          new ExportError(504, "EXPORT_TIMEOUT", "Export generation timed out")
        ),
      this.timeoutMs
    );

    try {
      const result = await task(controller.signal);
      throwIfAborted(controller.signal);
      return result;
    } catch (error) {
      if (controller.signal.aborted) throwIfAborted(controller.signal);
      throw error;
    } finally {
      clearTimeout(timeout);
      clientSignal.removeEventListener("abort", onClientAbort);
      this.active -= 1;
      this.startNext();
    }
  }

  private startNext() {
    while (this.active < this.concurrency && this.pending.length > 0) {
      const job = this.pending.shift()!;
      job.removeAbortListener();
      if (job.clientSignal.aborted) {
        job.reject(new ExportError(499, "EXPORT_CANCELLED", "Export was cancelled"));
        continue;
      }
      void this.execute(job.task, job.clientSignal).then(job.resolve, job.reject);
    }
  }
}

export const exportQueue = new ExportQueue(
  env.EXPORT_MAX_CONCURRENCY,
  env.EXPORT_MAX_QUEUE,
  env.EXPORT_TIMEOUT_MS
);
