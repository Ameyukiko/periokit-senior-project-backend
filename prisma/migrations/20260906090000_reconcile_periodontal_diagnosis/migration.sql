-- Corrective migration: the previous migration name was recorded as applied
-- in the database before its diagnosis DDL was finalized. Keep that history
-- intact and reconcile the missing objects in a new migration.

DO $$
BEGIN
    CREATE TYPE "public"."diagnosis_extent" AS ENUM (
        'localized',
        'generalized',
        'molar_incisor'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS "public"."periodontal_diagnoses" (
    "diagnosis_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "visit_id" UUID NOT NULL,
    "extent" "public"."diagnosis_extent",
    "complexity" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "periodontal_diagnoses_pkey" PRIMARY KEY ("diagnosis_id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "periodontal_diagnoses_visit_id_key"
ON "public"."periodontal_diagnoses"("visit_id");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'periodontal_diagnoses_visit_id_fkey'
          AND conrelid = 'public.periodontal_diagnoses'::regclass
    ) THEN
        ALTER TABLE "public"."periodontal_diagnoses"
        ADD CONSTRAINT "periodontal_diagnoses_visit_id_fkey"
        FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("visit_id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;
