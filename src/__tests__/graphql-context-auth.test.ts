import { beforeEach, describe, expect, it, vi } from "vitest";

const { authenticateAccessToken } = vi.hoisted(() => ({
  authenticateAccessToken: vi.fn(),
}));
vi.mock("../modules/auth/auth.identity", () => ({ authenticateAccessToken }));

import { getContextFromAuthHeader } from "../graphql/context";

describe("GraphQL authentication context", () => {
  beforeEach(() => authenticateAccessToken.mockReset());

  it("uses the authoritative database role instead of user metadata", async () => {
    authenticateAccessToken.mockResolvedValue({
      user: { id: "user-1", email: "dentist@example.com", user_metadata: { role: "super_admin" } },
      profile: { role: "dentist" },
    });
    const context = await getContextFromAuthHeader("Bearer valid-token");
    expect(context.user?.role).toBe("dentist");
    expect(authenticateAccessToken).toHaveBeenCalledWith("valid-token");
  });

  it("does not authenticate malformed authorization headers", async () => {
    await expect(getContextFromAuthHeader("Basic credentials")).resolves.toEqual({});
    expect(authenticateAccessToken).not.toHaveBeenCalled();
  });
});
