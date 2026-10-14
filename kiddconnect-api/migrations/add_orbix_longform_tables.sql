-- Orbix Long-Form Video System: puzzle library and long-form videos
-- Additive only: new tables only. No changes to existing orbix_* tables.

-- 1. puzzles: one row per approved mindteaser story, for long-form library and usage tracking
CREATE TABLE IF NOT EXISTS orbix_puzzles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES orbix_channels(id) ON DELETE SET NULL,
  raw_item_id UUID REFERENCES orbix_raw_items(id) ON DELETE SET NULL,
  story_id UUID NOT NULL REFERENCES orbix_stories(id) ON DELETE CASCADE,
  script_id UUID REFERENCES orbix_scripts(id) ON DELETE SET NULL,
  puzzle_number INTEGER,
  type VARCHAR(50),
  family VARCHAR(50),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  hook TEXT,
  short_render_id UUID REFERENCES orbix_renders(id) ON DELETE SET NULL,
  short_video_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(story_id)
);

CREATE INDEX IF NOT EXISTS idx_orbix_puzzles_business_id ON orbix_puzzles(business_id);
CREATE INDEX IF NOT EXISTS idx_orbix_puzzles_channel_id ON orbix_puzzles(channel_id) WHERE channel_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orbix_puzzles_story_id ON orbix_puzzles(story_id);
CREATE INDEX IF NOT EXISTS idx_orbix_puzzles_type ON orbix_puzzles(type) WHERE type IS NOT NULL;

COMMENT ON TABLE orbix_puzzles IS 'Puzzle library for Orbix Mind Teasers long-form; one row per approved mindteaser story. Backfilled from orbix_stories + raw_items + scripts.';

-- 2. puzzle_explanations: generated explanation content per puzzle (separate from puzzle row)
CREATE TABLE IF NOT EXISTS orbix_puzzle_explanations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  puzzle_id UUID NOT NULL REFERENCES orbix_puzzles(id) ON DELETE CASCADE,
  explanation_text TEXT,
  visual_steps_json JSONB,
  intro_line TEXT,
  recap_line TEXT,
  generated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(puzzle_id)
);

CREATE INDEX IF NOT EXISTS idx_orbix_puzzle_explanations_puzzle_id ON orbix_puzzle_explanations(puzzle_id);

COMMENT ON TABLE orbix_puzzle_explanations IS 'Generated explanation and visual steps for long-form videos; one row per puzzle.';

-- 3. longform_videos: one row per long-form video (single or compilation)
CREATE TABLE IF NOT EXISTS orbix_longform_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES orbix_channels(id) ON DELETE SET NULL,
  title TEXT,
  subtitle TEXT,
  hook_text TEXT,
  description TEXT,
  thumbnail_path TEXT,
  thumbnail_storage_path TEXT,
  video_path TEXT,
  video_storage_path TEXT,
  render_status VARCHAR(30) DEFAULT 'PENDING' CHECK (render_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  total_puzzles INTEGER DEFAULT 0,
  duration_seconds NUMERIC(10,2),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orbix_longform_videos_business_id ON orbix_longform_videos(business_id);
CREATE INDEX IF NOT EXISTS idx_orbix_longform_videos_channel_id ON orbix_longform_videos(channel_id) WHERE channel_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orbix_longform_videos_render_status ON orbix_longform_videos(render_status);

COMMENT ON TABLE orbix_longform_videos IS 'Long-form explanation videos (single or compilation); thumbnail and video stored in Supabase Storage.';

-- 4. longform_video_puzzles: many-to-many link with per-puzzle settings
CREATE TABLE IF NOT EXISTS orbix_longform_video_puzzles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  longform_video_id UUID NOT NULL REFERENCES orbix_longform_videos(id) ON DELETE CASCADE,
  puzzle_id UUID NOT NULL REFERENCES orbix_puzzles(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL DEFAULT 0,
  include_puzzle BOOLEAN DEFAULT TRUE,
  include_timer BOOLEAN DEFAULT TRUE,
  timer_seconds INTEGER DEFAULT 3,
  reveal_answer_before_explanation BOOLEAN DEFAULT TRUE,
  include_explanation BOOLEAN DEFAULT TRUE,
  narration_style VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(longform_video_id, puzzle_id)
);

CREATE INDEX IF NOT EXISTS idx_orbix_longform_video_puzzles_video ON orbix_longform_video_puzzles(longform_video_id);
CREATE INDEX IF NOT EXISTS idx_orbix_longform_video_puzzles_puzzle ON orbix_longform_video_puzzles(puzzle_id);

COMMENT ON TABLE orbix_longform_video_puzzles IS 'Which puzzles appear in which long-form video; supports reuse and per-puzzle settings.';
