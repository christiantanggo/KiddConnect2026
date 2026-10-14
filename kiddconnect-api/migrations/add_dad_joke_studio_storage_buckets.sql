-- Dad Joke Studio — Supabase Storage buckets (run if POST /api/v2/dad-joke-studio/assets returns 500 "Bucket not found")
-- Idempotent: safe to re-run.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'dadjoke-studio-assets',
    'dadjoke-studio-assets',
    TRUE,
    52428800,
    ARRAY[
      'image/jpeg',
      'image/png',
      'image/webp',
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/x-wav',
      'audio/mp4',
      'audio/aac'
    ]::text[]
  ),
  (
    'dadjoke-studio-renders',
    'dadjoke-studio-renders',
    TRUE,
    524288000,
    ARRAY['video/mp4']::text[]
  )
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'dadjoke-studio-assets: public read'
  ) THEN
    CREATE POLICY "dadjoke-studio-assets: public read"
      ON storage.objects FOR SELECT TO public
      USING (bucket_id = 'dadjoke-studio-assets');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'dadjoke-studio-renders: public read'
  ) THEN
    CREATE POLICY "dadjoke-studio-renders: public read"
      ON storage.objects FOR SELECT TO public
      USING (bucket_id = 'dadjoke-studio-renders');
  END IF;
END $$;
