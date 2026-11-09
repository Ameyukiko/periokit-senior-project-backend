import { describe, it, expect } from "vitest";
import { GraphQLError } from "graphql";
import { requireAuth, requireRole } from "../graphql/guards";
import type { GraphQLContext } from "../graphql/context";

const authedContext = (role?: string | null): GraphQLContext => ({
  accessToken: "token-123",
  user: { id: "user-1", email: "u@perio.kit", role },
});

describe("requireAuth", () => {
  it("returns auth info for an authenticated context", () => {
    const auth = requireAuth(authedContext());
    expect(auth).toEqual({
      accessToken: "token-123",
      userId: "user-1",
      email: "u@perio.kit",
    });
  });

  it("defaults email to null when missing", () => {
    const auth = requireAuth({
      accessToken: "t",
      user: { id: "user-1" },
    });
    expect(auth.email).toBeNull();
  });

  it("throws UNAUTHENTICATED when accessToken is missing", () => {
    try {
      requireAuth({ user: { id: "user-1" } });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(GraphQLError);
      expect((err as GraphQLError).extensions.code).toBe("UNAUTHENTICATED");
    }
  });

  it("throws UNAUTHENTICATED when user id is missing", () => {
    expect(() => requireAuth({ accessToken: "t" })).toThrow(GraphQLError);
  });
});

describe("requireRole", () => {
  it("returns auth info when role is allowed", () => {
    const auth = requireRole(authedContext("dentist"), ["dentist", "admin"]);
    expect(auth.userId).toBe("user-1");
  });

  it("throws FORBIDDEN when role is not allowed", () => {
    try {
      requireRole(authedContext("dentist"), ["admin"]);
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as GraphQLError).extensions.code).toBe("FORBIDDEN");
    }
  });

  it("throws FORBIDDEN when role is null", () => {
    try {
      requireRole(authedContext(null), ["dentist"]);
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as GraphQLError).extensions.code).toBe("FORBIDDEN");
    }
  });

  it("throws UNAUTHENTICATED before checking role when not authenticated", () => {
    try {
      requireRole({ user: { id: "user-1" } }, ["dentist"]);
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as GraphQLError).extensions.code).toBe("UNAUTHENTICATED");
    }
  });
});
