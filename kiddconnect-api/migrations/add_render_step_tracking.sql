-- Add step tracking to orbix_renders table
-- Tracks progress through each rendering step

ALTER TABLE orbix_renders
ADD COLUMN IF NOT EXISTS render_step VARCHAR(50) DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS step_progress INTEGER DEFAULT 0 CHECK (step_progress >= 0 AND step_progress <= 100),
ADD COLUMN IF NOT EXISTS step_started_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS step_completed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS step_error TEXT,
ADD COLUMN IF NOT EXISTS step_logs JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS video_step3_path TEXT, -- Background + motion + voice
ADD COLUMN IF NOT EXISTS video_step4_path TEXT, -- + hook text
ADD COLUMN IF NOT EXISTS video_step5_path TEXT, -- + captions
ADD COLUMN IF NOT EXISTS hashtags TEXT,
ADD COLUMN IF NOT EXISTS youtube_title TEXT,
ADD COLUMN IF NOT EXISTS youtube_description TEXT;

-- Add index for step tracking
CREATE INDEX IF NOT EXISTS idx_orbix_renders_render_step ON orbix_renders(render_step);
CREATE INDEX IF NOT EXISTS idx_orbix_renders_step_progress ON orbix_renders(step_progress);

-- Update render_status check constraint to include new statuses
ALTER TABLE orbix_renders
DROP CONSTRAINT IF EXISTS orbix_renders_render_status_check;

ALTER TABLE orbix_renders
ADD CONSTRAINT orbix_renders_render_status_check 
CHECK (render_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'STEP_FAILED'));

-- Add check constraint for render_step
ALTER TABLE orbix_renders
ADD CONSTRAINT orbix_renders_render_step_check 
CHECK (render_step IN (
  'PENDING',
  'STEP_3_BACKGROUND_VOICE',      -- Background motion + voice addition
  'STEP_4_HOOK_TEXT',              -- Impact/hook text addition
  'STEP_5_CAPTIONS',               -- Caption/subtitle addition
  'STEP_6_METADATA',               -- Caption and hashtag creation
  'STEP_7_YOUTUBE_UPLOAD',         -- YouTube upload
  'COMPLETED',
  'FAILED'
));




