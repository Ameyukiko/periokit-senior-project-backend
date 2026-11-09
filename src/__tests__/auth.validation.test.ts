import { describe, it, expect } from "vitest";
import {
  registerSchema,
  loginSchema,
} from "../modules/auth/auth.validation";

describe("registerSchema", () => {
  const valid = {
    email: "dentist@perio.kit",
    password: "secret6",
    firstName: "Siwali",
    lastName: "S",
  };

  it("accepts a minimal valid payload", () => {
    const result = registerSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = registerSchema.safeParse({ ...valid, email: "not-an-email" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Invalid email address");
    }
  });

  it("rejects a password shorter than 6 characters", () => {
    const result = registerSchema.safeParse({ ...valid, password: "12345" });
    expect(result.success).toBe(false);
  });

  it("requires a non-empty first name", () => {
    const result = registerSchema.safeParse({ ...valid, firstName: "" });
    expect(result.success).toBe(false);
  });

  it("coerces an empty studentId string to undefined", () => {
    const result = registerSchema.safeParse({ ...valid, studentId: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.studentId).toBeUndefined();
    }
  });

  it("coerces a numeric studentId string to a number", () => {
    const result = registerSchema.safeParse({ ...valid, studentId: "662115051" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.studentId).toBe(662115051);
    }
  });

  it("rejects a negative studentId", () => {
    const result = registerSchema.safeParse({ ...valid, studentId: "-5" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer studentId", () => {
    const result = registerSchema.safeParse({ ...valid, studentId: "5.5" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid profile image URL", () => {
    const result = registerSchema.safeParse({ ...valid, profileImageUrl: "not a url" });
    expect(result.success).toBe(false);
  });

  it("accepts a valid profile image URL", () => {
    const result = registerSchema.safeParse({
      ...valid,
      profileImageUrl: "https://cdn.perio.kit/a.png",
    });
    expect(result.success).toBe(true);
  });
});

describe("loginSchema", () => {
  it("accepts a valid login", () => {
    const result = loginSchema.safeParse({
      email: "a@b.com",
      password: "x",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty password", () => {
    const result = loginSchema.safeParse({ email: "a@b.com", password: "" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = loginSchema.safeParse({ email: "bad", password: "x" });
    expect(result.success).toBe(false);
  });
});
