-- Create a private bucket for radiograph assets.
INSERT INTO storage.buckets (id, name, public)
VALUES ('xray-images', 'xray-images', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Allow users to access objects only when they own the related visit.
CREATE POLICY "xray read own visits"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'xray-images'
  AND EXISTS (
    SELECT 1
    FROM public.visits v
    WHERE v.visit_id = (storage.foldername(name))[1]::uuid
      AND v.dentist_user_id = auth.uid()
  )
);

CREATE POLICY "xray write own visits"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'xray-images'
  AND EXISTS (
    SELECT 1
    FROM public.visits v
    WHERE v.visit_id = (storage.foldername(name))[1]::uuid
      AND v.dentist_user_id = auth.uid()
  )
);

CREATE POLICY "xray delete own visits"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'xray-images'
  AND EXISTS (
    SELECT 1
    FROM public.visits v
    WHERE v.visit_id = (storage.foldername(name))[1]::uuid
      AND v.dentist_user_id = auth.uid()
  )
);
