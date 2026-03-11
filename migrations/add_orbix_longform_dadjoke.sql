-- Dad Jokes long-form only: extend orbix_longform_videos and add dad-joke-specific data.
-- No changes to puzzle long-form or other channels.

-- 1. Add longform_type to orbix_longform_videos (puzzle | dadjoke)
ALTER TABLE orbix_longform_videos
  ADD COLUMN IF NOT EXISTS longform_type VARCHAR(20) DEFAULT 'puzzle'
  CHECK (longform_type IN ('puzzle', 'dadjoke'));

COMMENT ON COLUMN orbix_longform_videos.longform_type IS 'puzzle = mindteaser puzzle long-form; dadjoke = dad joke story-then-punchline long-form (Dad Jokes channel only).';

-- 2. Dad joke long-form script and metadata (one row per dad joke long-form video)
CREATE TABLE IF NOT EXISTS orbix_longform_dadjoke_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  longform_video_id UUID NOT NULL REFERENCES orbix_longform_videos(id) ON DELETE CASCADE,
  story_id UUID NOT NULL REFERENCES orbix_stories(id) ON DELETE CASCADE,
  script_json JSONB NOT NULL DEFAULT '{}',
  generated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(longform_video_id)
);

CREATE INDEX IF NOT EXISTS idx_orbix_longform_dadjoke_data_video ON orbix_longform_dadjoke_data(longform_video_id);
CREATE INDEX IF NOT EXISTS idx_orbix_longform_dadjoke_data_story ON orbix_longform_dadjoke_data(story_id);

COMMENT ON TABLE orbix_longform_dadjoke_data IS 'Generated script and metadata for dad joke long-form videos (story monologue + final joke). Dad Jokes channel only.';
