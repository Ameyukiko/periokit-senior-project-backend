import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("admin users API contract", () => {
  const repository = readFileSync(resolve(process.cwd(), "src/modules/admin-users/admin-users.repository.ts"), "utf8");
  const routes = readFileSync(resolve(process.cwd(), "src/modules/admin-users/admin-users.routes.ts"), "utf8");

  it("searches first name, last name, full name, email and partial student id", () => {
    expect(repository).toContain("u.first_name ILIKE");
    expect(repository).toContain("u.last_name ILIKE");
    expect(repository).toContain("concat_ws(' ', u.first_name, u.last_name) ILIKE");
    expect(repository).toContain("u.email ILIKE");
    expect(repository).toContain("u.student_id::text");
  });

  it("does not expose create or invite routes", () => {
    expect(routes).not.toMatch(/router\.post\("\/users"/);
    expect(routes).not.toContain("invite");
  });
});
