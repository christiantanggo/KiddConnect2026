-- Movie Review Studio: tables, module registration, storage bucket policies
-- Run in Supabase SQL Editor. Does NOT touch any existing tables.

-- ============================================================
-- PROJECTS
-- ============================================================
CREATE TABLE IF NOT EXISTS movie_review_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  movie_title VARCHAR(255) NOT NULL,
  content_type VARCHAR(50) NOT NULL DEFAULT 'review'
    CHECK (content_type IN ('review','facts','theory','ranking','other')),
  notes_text TEXT,
  tmdb_movie_id INTEGER,
  tmdb_poster_url TEXT,
  hook_text TEXT,
  tagline_text TEXT,
  yt_title TEXT,
  yt_description TEXT,
  yt_hashtags JSONB DEFAULT '[]'::jsonb,
  voice_asset_id UUID,
  music_asset_id UUID,
  max_duration_seconds INTEGER NOT NULL DEFAULT 50,
  privacy VARCHAR(20) NOT NULL DEFAULT 'UNLISTED'
    CHECK (privacy IN ('PUBLIC','UNLISTED','PRIVATE')),
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','RENDERING','READY','UPLOADING','PUBLISHED','FAILED')),
  render_url TEXT,
  youtube_video_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mr_projects_business ON movie_review_projects(business_id);
CREATE INDEX IF NOT EXISTS idx_mr_projects_status ON movie_review_projects(status);
CREATE INDEX IF NOT EXISTS idx_mr_projects_created ON movie_review_projects(created_at DESC);

-- ============================================================
-- ASSETS (images, voice recordings, music)
-- ============================================================
CREATE TABLE IF NOT EXISTS movie_review_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  project_id UUID REFERENCES movie_review_projects(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('IMAGE','AUDIO_VOICE','AUDIO_MUSIC')),
  storage_bucket VARCHAR(100) NOT NULL,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  original_name TEXT,
  duration_seconds NUMERIC,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mr_assets_project ON movie_review_assets(project_id);
CREATE INDEX IF NOT EXISTS idx_mr_assets_business ON movie_review_assets(business_id);
CREATE INDEX IF NOT EXISTS idx_mr_assets_type ON movie_review_assets(type);

-- ============================================================
-- TIMELINE ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS movie_review_timeline_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES movie_review_projects(id) ON DELETE CASCADE,
  type VARCHAR(10) NOT NULL CHECK (type IN ('IMAGE','TEXT')),
  asset_id UUID REFERENCES movie_review_assets(id) ON DELETE SET NULL,
  text_content TEXT,
  start_time NUMERIC NOT NULL DEFAULT 0,
  end_time NUMERIC NOT NULL DEFAULT 5,
  position_preset VARCHAR(10) NOT NULL DEFAULT 'CENTER'
    CHECK (position_preset IN ('TOP','CENTER','BOTTOM')),
  motion_preset VARCHAR(20) NOT NULL DEFAULT 'ZOOM_IN'
    CHECK (motion_preset IN ('ZOOM_IN','ZOOM_OUT','PAN_LEFT','PAN_RIGHT')),
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mr_timeline_project ON movie_review_timeline_items(project_id);

-- ============================================================
-- RENDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS movie_review_renders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES movie_review_projects(id) ON DELETE CASCADE,
  business_id UUID NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','RENDERING','DONE','FAILED')),
  progress INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  output_url TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mr_renders_project ON movie_review_renders(project_id);
CREATE INDEX IF NOT EXISTS idx_mr_renders_status ON movie_review_renders(status);

-- ============================================================
-- MODULE REGISTRATION
-- ============================================================
INSERT INTO modules (key, name, description, category, is_active, health_status, version, metadata, created_at, updated_at)
VALUES (
  'movie-review',
  'Movie Review Studio',
  'Create YouTube Shorts reviewing movies, facts, and theories — record your voice, add images, and upload automatically',
  'content',
  TRUE,
  'healthy',
  '1.0.0',
  '{}'::jsonb,
  NOW(),
  NOW()
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  is_active = EXCLUDED.is_active,
  health_status = EXCLUDED.health_status,
  version = EXCLUDED.version,
  updated_at = NOW();

-- ============================================================
-- STORAGE BUCKET POLICIES (run after creating buckets in Supabase dashboard)
-- Buckets to create: movie-review-voices, movie-review-images, movie-review-renders, movie-review-music
-- ============================================================

-- Allow service role full access (backend uses service role key)
-- These policies are for anon/authenticated reads of public URLs

-- movie-review-renders: public read so video player works
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'movie_review_renders_public_read'
  ) THEN
    CREATE POLICY "movie_review_renders_public_read" ON storage.objects
      FOR SELECT USING (bucket_id = 'movie-review-renders');
  END IF;
END $$;

-- movie-review-images: public read so images display in editor
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'movie_review_images_public_read'
  ) THEN
    CREATE POLICY "movie_review_images_public_read" ON storage.objects
      FOR SELECT USING (bucket_id = 'movie-review-images');
  END IF;
END $$;

-- movie-review-voices: public read for playback
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'movie_review_voices_public_read'
  ) THEN
    CREATE POLICY "movie_review_voices_public_read" ON storage.objects
      FOR SELECT USING (bucket_id = 'movie-review-voices');
  END IF;
END $$;

-- movie-review-music: public read for preview
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'movie_review_music_public_read'
  ) THEN
    CREATE POLICY "movie_review_music_public_read" ON storage.objects
      FOR SELECT USING (bucket_id = 'movie-review-music');
  END IF;
END $$;
