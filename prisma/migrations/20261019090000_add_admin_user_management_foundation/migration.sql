-- Add the privileged role without promoting any existing account. The first
-- super-admin is intentionally assigned later through a controlled manual step.
ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'super_admin';

CREATE TYPE "public"."admin_user_audit_action" AS ENUM (
    'profile_updated',
    'role_changed',
    'deactivated',
    'reactivated',
    'deleted',
    'restored'
);

ALTER TABLE "public"."users"
    ADD COLUMN "deleted_at" TIMESTAMPTZ(6),
    ADD COLUMN "deleted_by" UUID,
    ADD COLUMN "updated_by" UUID;

-- Preserve pre-existing soft-deleted rows while making their lifecycle state
-- compatible with the new constraints. Historical actor data is unavailable.
UPDATE "public"."users"
SET
    "is_active" = false,
    "deleted_at" = COALESCE("updated_at", "created_at", CURRENT_TIMESTAMP)
WHERE "is_deleted" = true;

ALTER TABLE "public"."users"
    ADD CONSTRAINT "users_deleted_state_check"
        CHECK ("is_deleted" = ("deleted_at" IS NOT NULL)),
    ADD CONSTRAINT "users_deleted_inactive_check"
        CHECK (NOT "is_deleted" OR NOT "is_active"),
    ADD CONSTRAINT "users_deleted_by_state_check"
        CHECK ("is_deleted" OR "deleted_by" IS NULL),
    ADD CONSTRAINT "users_deleted_by_fkey"
        FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("user_id")
        ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "users_updated_by_fkey"
        FOREIGN KEY ("updated_by") REFERENCES "public"."users"("user_id")
        ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "public"."admin_user_audit_logs" (
    "audit_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_user_id" UUID NOT NULL,
    "actor_role" "public"."user_role" NOT NULL,
    "target_user_id" UUID NOT NULL,
    "target_role_before" "public"."user_role",
    "target_role_after" "public"."user_role",
    "action" "public"."admin_user_audit_action" NOT NULL,
    "before_data" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "after_data" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "request_id" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_user_audit_logs_pkey" PRIMARY KEY ("audit_id"),
    CONSTRAINT "admin_user_audit_logs_actor_user_id_fkey"
        FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("user_id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "admin_user_audit_logs_target_user_id_fkey"
        FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("user_id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "users_deleted_active_idx"
    ON "public"."users"("is_deleted", "is_active");
CREATE INDEX "users_role_deleted_active_idx"
    ON "public"."users"("role", "is_deleted", "is_active");
CREATE INDEX "users_student_id_idx"
    ON "public"."users"("student_id");
CREATE INDEX "users_created_at_desc_idx"
    ON "public"."users"("created_at" DESC);
CREATE INDEX "users_deleted_at_idx"
    ON "public"."users"("deleted_at");

CREATE INDEX "admin_user_audit_actor_created_idx"
    ON "public"."admin_user_audit_logs"("actor_user_id", "created_at" DESC);
CREATE INDEX "admin_user_audit_target_created_idx"
    ON "public"."admin_user_audit_logs"("target_user_id", "created_at" DESC);
CREATE INDEX "admin_user_audit_action_created_idx"
    ON "public"."admin_user_audit_logs"("action", "created_at" DESC);
CREATE INDEX "admin_user_audit_request_id_idx"
    ON "public"."admin_user_audit_logs"("request_id");

-- pg_trgm keeps case-insensitive contains searches responsive for the admin
-- list. Supabase installations conventionally keep extensions in this schema.
CREATE SCHEMA IF NOT EXISTS "extensions";
CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "extensions";
SET search_path = public, extensions;

CREATE INDEX "users_first_name_trgm_idx"
    ON "public"."users" USING GIN (lower("first_name") gin_trgm_ops);
CREATE INDEX "users_last_name_trgm_idx"
    ON "public"."users" USING GIN (lower("last_name") gin_trgm_ops);
CREATE INDEX "users_full_name_trgm_idx"
    ON "public"."users" USING GIN (lower("first_name" || ' ' || "last_name") gin_trgm_ops);
CREATE INDEX "users_email_trgm_idx"
    ON "public"."users" USING GIN (lower("email") gin_trgm_ops);
CREATE INDEX "users_student_id_text_trgm_idx"
    ON "public"."users" USING GIN (("student_id"::text) gin_trgm_ops);

RESET search_path;

-- Audit rows are immutable through normal SQL operations. Database owners can
-- still perform controlled maintenance by explicitly disabling the trigger.
CREATE FUNCTION "public"."prevent_admin_user_audit_log_mutation"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    RAISE EXCEPTION 'admin user audit logs are append-only'
        USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "admin_user_audit_logs_append_only"
BEFORE UPDATE OR DELETE ON "public"."admin_user_audit_logs"
FOR EACH ROW
EXECUTE FUNCTION "public"."prevent_admin_user_audit_log_mutation"();

-- This trigger protects the ordinary single-transaction case. The backend must
-- take the same advisory transaction lock before privileged role/lifecycle
-- mutations so concurrent requests serialize before evaluating permissions.
CREATE FUNCTION "public"."protect_last_active_super_admin"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    removes_active_super_admin boolean;
BEGIN
    IF TG_OP = 'DELETE' THEN
        removes_active_super_admin :=
            OLD."role" = 'super_admin'::"public"."user_role"
            AND OLD."is_active"
            AND NOT OLD."is_deleted";
    ELSE
        removes_active_super_admin :=
            OLD."role" = 'super_admin'::"public"."user_role"
            AND OLD."is_active"
            AND NOT OLD."is_deleted"
            AND NOT (
                NEW."role" = 'super_admin'::"public"."user_role"
                AND NEW."is_active"
                AND NOT NEW."is_deleted"
            );
    END IF;

    IF removes_active_super_admin THEN
        PERFORM pg_advisory_xact_lock(hashtext('periokit:last-active-super-admin'));

        IF NOT EXISTS (
            SELECT 1
            FROM "public"."users" AS candidate
            WHERE candidate."user_id" <> OLD."user_id"
              AND candidate."role" = 'super_admin'::"public"."user_role"
              AND candidate."is_active"
              AND NOT candidate."is_deleted"
        ) THEN
            RAISE EXCEPTION 'cannot remove the last active super-admin'
                USING ERRCODE = '23514',
                      CONSTRAINT = 'users_last_active_super_admin_check';
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "users_protect_last_active_super_admin"
BEFORE UPDATE OR DELETE ON "public"."users"
FOR EACH ROW
EXECUTE FUNCTION "public"."protect_last_active_super_admin"();
