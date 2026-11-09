-- Restrict radiograph uploads to supported web image formats and 10 MiB.
UPDATE storage.buckets
SET
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'xray-images';
