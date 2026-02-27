-- Movie Review Studio — Full Migration
-- Run this in Supabase SQL Editor: Dashboard → SQL Editor → New Query
-- All statements are idempotent (safe to re-run).

-- ─── 1. Projects ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS movie_review_projects (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id          UUID NOT NULL,
  movie_title          TEXT NOT NULL,
  content_type         TEXT NOT NULL DEFAULT 'review',  -- review | facts | theory | ranking | other
  notes_text           TEXT,
  hook_text            TEXT,
  tagline_text         TEXT,
  yt_title             TEXT,
  yt_description       TEXT,
  yt_hashtags          TEXT[] DEFAULT '{}',
  tmdb_movie_id        INTEGER,
  tmdb_poster_url      TEXT,
  voice_asset_id       UUID,
  music_asset_id       UUID,
  render_url           TEXT,
  yt_video_id          TEXT,
  yt_video_url         TEXT,
  max_duration_seconds INTEGER NOT NULL DEFAULT 50,
  privacy              TEXT NOT NULL DEFAULT 'UNLISTED',  -- PUBLIC | UNLISTED | PRIVATE
  status               TEXT NOT NULL DEFAULT 'DRAFT',     -- DRAFT | RENDERING | DONE | UPLOADING | PUBLISHED | ERROR
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_movie_review_projects_business_id
  ON movie_review_projects (business_id);

CREATE INDEX IF NOT EXISTS idx_movie_review_projects_status
  ON movie_review_projects (business_id, status);

-- ─── 2. Assets ────────────────────────────────────────────────────────────────
-- Stores uploaded images, voice recordings, and music files linked to a project.

CREATE TABLE IF NOT EXISTS movie_review_assets (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID NOT NULL,
  project_id       UUID NOT NULL REFERENCES movie_review_projects (id) ON DELETE CASCADE,
  type             TEXT NOT NULL,            -- IMAGE | AUDIO_VOICE | AUDIO_MUSIC
  storage_bucket   TEXT NOT NULL,
  storage_path     TEXT NOT NULL,
  public_url       TEXT NOT NULL,
  original_name    TEXT,
  duration_seconds NUMERIC,
  order_index      INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_movie_review_assets_project_id
  ON movie_review_assets (project_id);

CREATE INDEX IF NOT EXISTS idx_movie_review_assets_business_id
  ON movie_review_assets (business_id);

CREATE INDEX IF NOT EXISTS idx_movie_review_assets_type
  ON movie_review_assets (project_id, type);

-- ─── 3. Timeline Items ────────────────────────────────────────────────────────
-- Each row is one item on the video timeline (image clip or text overlay).

CREATE TABLE IF NOT EXISTS movie_review_timeline_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES movie_review_projects (id) ON DELETE CASCADE,
  type            TEXT NOT NULL,           -- IMAGE | TEXT
  asset_id        UUID REFERENCES movie_review_assets (id) ON DELETE SET NULL,
  text_content    TEXT,
  start_time      NUMERIC NOT NULL DEFAULT 0,
  end_time        NUMERIC NOT NULL DEFAULT 5,
  position_preset TEXT NOT NULL DEFAULT 'CENTER',  -- TOP | CENTER | BOTTOM
  motion_preset   TEXT NOT NULL DEFAULT 'ZOOM_IN', -- ZOOM_IN | ZOOM_OUT | PAN_LEFT | PAN_RIGHT
  order_index     INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_movie_review_timeline_project_id
  ON movie_review_timeline_items (project_id, order_index);

-- ─── 4. Renders ───────────────────────────────────────────────────────────────
-- One row per render attempt for a project.

CREATE TABLE IF NOT EXISTS movie_review_renders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES movie_review_projects (id) ON DELETE CASCADE,
  business_id  UUID NOT NULL,
  status       TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING | PROCESSING | DONE | ERROR
  progress     INTEGER NOT NULL DEFAULT 0,       -- 0-100
  error        TEXT,
  output_path  TEXT,
  started_at   TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_movie_review_renders_project_id
  ON movie_review_renders (project_id);

CREATE INDEX IF NOT EXISTS idx_movie_review_renders_business_id
  ON movie_review_renders (business_id);

-- ─── 5. Register module ───────────────────────────────────────────────────────

INSERT INTO modules (key, name, description, category, is_active, health_status, version, metadata, created_at, updated_at)
VALUES (
  'movie-review',
  'Movie Review Studio',
  'Create YouTube Shorts movie reviews with voice recording, images, and AI-generated metadata',
  'content',
  TRUE,
  'healthy',
  '1.0.0',
  '{
    "pricing": {
      "monthly_price_cents": 0,
      "currency": "usd",
      "interval": "month"
    },
    "features": {
      "voice_recording": true,
      "image_upload": true,
      "ai_metadata": true,
      "youtube_publishing": true,
      "background_music": true
    }
  }'::jsonb,
  NOW(),
  NOW()
) ON CONFLICT (key) DO UPDATE SET
  name         = EXCLUDED.name,
  description  = EXCLUDED.description,
  is_active    = EXCLUDED.is_active,
  health_status = EXCLUDED.health_status,
  version      = EXCLUDED.version,
  metadata     = EXCLUDED.metadata,
  updated_at   = NOW();

-- ─── 6. Storage buckets ───────────────────────────────────────────────────────
-- Create all four buckets used by the module.
-- If a bucket already exists the INSERT is silently ignored.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('movie-review-voices',  'movie-review-voices',  TRUE,  52428800, ARRAY['audio/mpeg','audio/mp4','audio/webm','audio/ogg','audio/wav']),
  ('movie-review-images',  'movie-review-images',  TRUE,  20971520, ARRAY['image/jpeg','image/png','image/gif','image/webp']),
  ('movie-review-renders', 'movie-review-renders', TRUE, 524288000, ARRAY['video/mp4']),
  ('movie-review-music',   'movie-review-music',   TRUE,  52428800, ARRAY['audio/mpeg','audio/mp4','audio/ogg','audio/wav','audio/aac'])
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─── 7. Storage RLS policies — movie-review-voices ───────────────────────────
-- Public read so the <audio> element in the browser can play the MP3 without auth.
-- Service-role (backend) handles writes; anon/authenticated have no write access.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'movie-review-voices: public read'
  ) THEN
    CREATE POLICY "movie-review-voices: public read"
      ON storage.objects FOR SELECT TO public
      USING (bucket_id = 'movie-review-voices');
  END IF;
END $$;

-- ─── 8. Storage RLS policies — movie-review-images ───────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'movie-review-images: public read'
  ) THEN
    CREATE POLICY "movie-review-images: public read"
      ON storage.objects FOR SELECT TO public
      USING (bucket_id = 'movie-review-images');
  END IF;
END $$;

-- ─── 9. Storage RLS policies — movie-review-renders ──────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'movie-review-renders: public read'
  ) THEN
    CREATE POLICY "movie-review-renders: public read"
      ON storage.objects FOR SELECT TO public
      USING (bucket_id = 'movie-review-renders');
  END IF;
END $$;

-- ─── 10. Storage RLS policies — movie-review-music ───────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'movie-review-music: public read'
  ) THEN
    CREATE POLICY "movie-review-music: public read"
      ON storage.objects FOR SELECT TO public
      USING (bucket_id = 'movie-review-music');
  END IF;
END $$;
