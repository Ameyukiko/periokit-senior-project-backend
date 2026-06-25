import { describe, it, expect, vi } from "vitest";
import { AppError, handleError } from "../utils/errors";
import type { Response } from "express";

const makeRes = () => {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: any };
};

describe("AppError", () => {
  it("stores statusCode and defaults isOperational to true", () => {
    const err = new AppError("nope", 404);
    expect(err.message).toBe("nope");
    expect(err.statusCode).toBe(404);
    expect(err.isOperational).toBe(true);
    expect(err).toBeInstanceOf(Error);
  });

  it("allows isOperational to be set to false", () => {
    const err = new AppError("boom", 500, false);
    expect(err.isOperational).toBe(false);
  });
});

describe("handleError", () => {
  it("uses AppError statusCode and message", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = makeRes();
    handleError(res, new AppError("not found", 404), "fallback");
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ success: false, message: "not found" });
  });

  it("masks unknown errors with the fallback message and default 400", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = makeRes();
    handleError(res, new Error("internal db secret"), "Something went wrong");
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ success: false, message: "Something went wrong" });
  });

  it("honours a custom fallback status code", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = makeRes();
    handleError(res, { weird: true }, "fail", 500);
    expect(res.statusCode).toBe(500);
  });
});
