CREATE TYPE "public"."diagnosis_extent" AS ENUM ('localized', 'generalized', 'molar_incisor');

CREATE TABLE "public"."periodontal_diagnoses" (
    "diagnosis_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "visit_id" UUID NOT NULL,
    "extent" "public"."diagnosis_extent",
    "complexity" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "periodontal_diagnoses_pkey" PRIMARY KEY ("diagnosis_id")
);

CREATE UNIQUE INDEX "periodontal_diagnoses_visit_id_key"
ON "public"."periodontal_diagnoses"("visit_id");

ALTER TABLE "public"."periodontal_diagnoses"
ADD CONSTRAINT "periodontal_diagnoses_visit_id_fkey"
FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("visit_id")
ON DELETE CASCADE ON UPDATE CASCADE;
