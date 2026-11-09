import { describe, expect, it } from "vitest";
import { adminUserListSchema, updateAdminUserSchema } from "../modules/admin-users/admin-users.validation";

describe("admin user list validation", () => {
  it("provides safe pagination and sorting defaults", () => {
    const result = adminUserListSchema.parse({});
    expect(result).toMatchObject({ page: 1, pageSize: 10, status: "all", sortBy: "createdAt", sortDirection: "desc" });
  });

  it("accepts supported search, filters and a bounded page size", () => {
    const result = adminUserListSchema.safeParse({ search: "สมชาย", role: "dentist", status: "active", lastSignIn: "last_7_days", page: "2", pageSize: "50" });
    expect(result.success).toBe(true);
  });

  it("rejects unknown filters and page sizes over 50", () => {
    expect(adminUserListSchema.safeParse({ createdDate: "today" }).success).toBe(false);
    expect(adminUserListSchema.safeParse({ pageSize: "51" }).success).toBe(false);
  });
});

describe("admin user update validation", () => {
  it("allows profile and role fields but never email or lifecycle fields", () => {
    expect(updateAdminUserSchema.safeParse({ firstName: "Anan", studentId: null }).success).toBe(true);
    expect(updateAdminUserSchema.safeParse({ role: "super_admin" }).success).toBe(true);
    expect(updateAdminUserSchema.safeParse({ email: "new@example.com" }).success).toBe(false);
    expect(updateAdminUserSchema.safeParse({ isActive: false }).success).toBe(false);
  });

  it("rejects an empty patch", () => {
    expect(updateAdminUserSchema.safeParse({}).success).toBe(false);
  });
});
