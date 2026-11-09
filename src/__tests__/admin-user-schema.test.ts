import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(
  resolve(process.cwd(), "prisma/schema.prisma"),
  "utf8"
);

const migration = readFileSync(
  resolve(
    process.cwd(),
    "prisma/migrations/20261019090000_add_admin_user_management_foundation/migration.sql"
  ),
  "utf8"
);

describe("admin user management database contract", () => {
  it("adds the super-admin role without promoting an existing account", () => {
    expect(migration).toContain(
      `ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'super_admin'`
    );
    const dataUpdates = migration.match(
      /UPDATE\s+"public"\."users"[\s\S]*?;/gi
    );
    expect(dataUpdates ?? []).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/"role"\s*=/i)])
    );
    expect(schema).toMatch(/enum user_role\s*{[\s\S]*super_admin/);
  });

  it("keeps deleted account state internally consistent", () => {
    expect(migration).toContain("users_deleted_state_check");
    expect(migration).toContain("users_deleted_inactive_check");
    expect(migration).toContain("users_deleted_by_state_check");
    expect(schema).toContain("deleted_at");
    expect(schema).toContain("deleted_by");
  });

  it("creates append-only audit history for every supported admin action", () => {
    for (const action of [
      "profile_updated",
      "role_changed",
      "deactivated",
      "reactivated",
      "deleted",
      "restored",
    ]) {
      expect(schema).toContain(action);
      expect(migration).toContain(`'${action}'`);
    }

    expect(migration).toContain("admin_user_audit_logs_append_only");
    expect(migration).toContain("prevent_admin_user_audit_log_mutation");
  });

  it("protects the final active super-admin", () => {
    expect(migration).toContain("users_protect_last_active_super_admin");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("users_last_active_super_admin_check");
    expect(migration).toContain("cannot remove the last active super-admin");
  });

  it("adds indexes for list filters, ordering, audit lookup, and partial search", () => {
    for (const index of [
      "users_deleted_active_idx",
      "users_role_deleted_active_idx",
      "users_created_at_desc_idx",
      "admin_user_audit_target_created_idx",
      "users_full_name_trgm_idx",
      "users_email_trgm_idx",
      "users_student_id_text_trgm_idx",
    ]) {
      expect(migration).toContain(index);
    }
  });
});
