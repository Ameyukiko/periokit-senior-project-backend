import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  SUPABASE_URL: z.string().url("SUPABASE_URL must be a valid URL"),
  SUPABASE_ANON_KEY: z.string().min(1, "SUPABASE_ANON_KEY is required"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  SUPABASE_PROFILE_IMAGES_BUCKET: z.string().default("profile-images"),
  SUPABASE_XRAY_BUCKET: z.string().default("xray-images"),
  SUPABASE_XRAY_SIGNED_URL_EXPIRES_IN: z.coerce.number().int().positive().default(14400),
  SUPABASE_XRAY_MAX_FILE_SIZE_BYTES: z.coerce.number().int().positive().default(10485760),
  SUPABASE_XRAY_MAX_PIXELS: z.coerce.number().int().positive().default(50000000),
  SUPABASE_PROFILE_IMAGE_SIGNED_URL_EXPIRES_IN: z.coerce.number().default(604800),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  ALLOWED_ORIGINS: z.string().optional(),
  JSON_BODY_LIMIT: z.string().default("1mb"),
  EXPORT_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  EXPORT_MAX_QUEUE: z.coerce.number().int().min(0).max(100).default(10),
  EXPORT_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).default(60000),
  EXPORT_SOURCE_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(4),
  EXPORT_SOURCE_MAX_QUEUE: z.coerce.number().int().min(0).max(100).default(20),
  EXPORT_SOURCE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).default(30000),
  EXPORT_MAX_PAGES: z.coerce.number().int().min(1).max(20).default(6),
  EXPORT_MAX_ASSETS: z.coerce.number().int().min(1).max(100).default(30),
  EXPORT_ASSET_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(3),
  EXPORT_ASSET_CACHE_TTL_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(3600000)
    .default(300000),
  EXPORT_ASSET_CACHE_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(1024 * 1024)
    .max(512 * 1024 * 1024)
    .default(128 * 1024 * 1024),
  EXPORT_MAX_SOURCE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(150 * 1024 * 1024),
  EXPORT_RENDERER_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional()
  ),
  EXPORT_RENDERER_READY_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(60000)
    .default(15000),
  EXPORT_RENDER_CACHE_TTL_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(300000)
    .default(30000),
  EXPORT_RENDER_CACHE_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(1024 * 1024)
    .max(512 * 1024 * 1024)
    .default(64 * 1024 * 1024),
});

export type Env = z.infer<typeof envSchema>;

// This will throw an error and crash the server if validation fails
export const env = envSchema.parse(process.env);
