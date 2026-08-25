-- CreateEnum
CREATE TYPE "public"."xray_board_status" AS ENUM ('draft', 'saved');

-- CreateEnum
CREATE TYPE "public"."xray_object_type" AS ENUM ('image', 'note');

-- CreateEnum
CREATE TYPE "public"."xray_asset_status" AS ENUM ('pending', 'active', 'orphaned', 'cleanup_failed');

-- CreateTable
CREATE TABLE "public"."xray_boards" (
    "board_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "visit_id" UUID NOT NULL,
    "status" "public"."xray_board_status" NOT NULL DEFAULT 'draft',
    "saved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "xray_boards_pkey" PRIMARY KEY ("board_id")
);

-- CreateTable
CREATE TABLE "public"."visit_xray_assets" (
    "asset_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "visit_id" UUID NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "storage_path" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "natural_width" INTEGER NOT NULL,
    "natural_height" INTEGER NOT NULL,
    "status" "public"."xray_asset_status" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "visit_xray_assets_pkey" PRIMARY KEY ("asset_id")
);

-- CreateTable
CREATE TABLE "public"."xray_board_objects" (
    "object_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "board_id" UUID NOT NULL,
    "object_type" "public"."xray_object_type" NOT NULL,
    "asset_id" UUID,
    "z_index" SMALLINT NOT NULL DEFAULT 0,
    "pos_x" INTEGER NOT NULL,
    "pos_y" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "rotation" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "slot_code" VARCHAR(50),
    "note_text" TEXT,
    "note_color" VARCHAR(9),
    "note_font_size" SMALLINT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "xray_board_objects_pkey" PRIMARY KEY ("object_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "xray_boards_visit_id_key" ON "public"."xray_boards"("visit_id");
CREATE INDEX "xray_boards_status_idx" ON "public"."xray_boards"("status");
CREATE UNIQUE INDEX "visit_xray_assets_storage_path_key" ON "public"."visit_xray_assets"("storage_path");
CREATE INDEX "visit_xray_assets_visit_id_idx" ON "public"."visit_xray_assets"("visit_id");
CREATE INDEX "visit_xray_assets_uploaded_by_idx" ON "public"."visit_xray_assets"("uploaded_by");
CREATE INDEX "visit_xray_assets_status_created_at_idx" ON "public"."visit_xray_assets"("status", "created_at");
CREATE UNIQUE INDEX "xray_board_objects_board_id_slot_code_key" ON "public"."xray_board_objects"("board_id", "slot_code");
CREATE INDEX "xray_board_objects_board_id_z_index_idx" ON "public"."xray_board_objects"("board_id", "z_index");
CREATE INDEX "xray_board_objects_asset_id_idx" ON "public"."xray_board_objects"("asset_id");

-- AddForeignKey
ALTER TABLE "public"."xray_boards" ADD CONSTRAINT "xray_boards_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("visit_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."visit_xray_assets" ADD CONSTRAINT "visit_xray_assets_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("visit_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."visit_xray_assets" ADD CONSTRAINT "visit_xray_assets_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."xray_board_objects" ADD CONSTRAINT "xray_board_objects_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "public"."xray_boards"("board_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."xray_board_objects" ADD CONSTRAINT "xray_board_objects_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "public"."visit_xray_assets"("asset_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add CHECK constraints
ALTER TABLE "public"."visit_xray_assets"
ADD CONSTRAINT "xray_asset_file_size_positive"
CHECK ("file_size" > 0);

ALTER TABLE "public"."visit_xray_assets"
ADD CONSTRAINT "xray_asset_dimensions_positive"
CHECK ("natural_width" > 0 AND "natural_height" > 0);

ALTER TABLE "public"."xray_board_objects"
ADD CONSTRAINT "xray_object_dimensions_positive"
CHECK ("width" > 0 AND "height" > 0);

ALTER TABLE "public"."xray_board_objects"
ADD CONSTRAINT "xray_object_rotation_valid"
CHECK ("rotation" >= 0 AND "rotation" < 360);

ALTER TABLE "public"."xray_board_objects"
ADD CONSTRAINT "xray_object_asset_required_for_image"
CHECK (
    ("object_type" = 'image' AND "asset_id" IS NOT NULL)
    OR
    ("object_type" = 'note' AND "asset_id" IS NULL)
);
