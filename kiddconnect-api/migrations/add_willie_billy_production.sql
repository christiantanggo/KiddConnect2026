-- Willie & Billy production queue and public video bucket.
-- Idempotent. The API service role is the only client.

CREATE TABLE IF NOT EXISTS public.willie_billy_renders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('short', 'chapter')),
  episode_number integer,
  week integer NOT NULL,
  day integer,
  slot text,
  title text NOT NULL,
  youtube_title text,
  script text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'rendering', 'ready', 'failed')),
  video_url text,
  image_url text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS willie_billy_renders_short_uq
  ON public.willie_billy_renders (business_id, episode_number)
  WHERE kind = 'short';

CREATE UNIQUE INDEX IF NOT EXISTS willie_billy_renders_chapter_uq
  ON public.willie_billy_renders (business_id, week)
  WHERE kind = 'chapter';

CREATE INDEX IF NOT EXISTS willie_billy_renders_queue_idx
  ON public.willie_billy_renders (status, created_at);

ALTER TABLE public.willie_billy_renders ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.willie_billy_renders FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.willie_billy_renders TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'willie-billy-renders',
  'willie-billy-renders',
  TRUE,
  524288000,
  ARRAY['video/mp4', 'image/png']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'willie-billy-renders: public read'
  ) THEN
    CREATE POLICY "willie-billy-renders: public read"
      ON storage.objects FOR SELECT TO public
      USING (bucket_id = 'willie-billy-renders');
  END IF;
END $$;

UPDATE modules
SET
  description = 'Year-long hide-and-seek series. Makes two shorts a day and one chapter a week, from the bet in Marrow to the real-world porch.',
  metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{features}',
    COALESCE(metadata->'features', '{}'::jsonb) || '{"producer": true, "shorts": 730, "chapters": 52}'::jsonb
  ),
  updated_at = NOW()
WHERE key = 'willie-billy';
