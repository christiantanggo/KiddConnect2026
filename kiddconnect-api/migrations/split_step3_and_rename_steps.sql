-- Split STEP_3_BACKGROUND_VOICE into STEP_3_BACKGROUND and STEP_4_VOICE
-- Rename subsequent steps: STEP_4→STEP_5, STEP_5→STEP_6, STEP_6→STEP_7, STEP_7→STEP_8

-- First, update any existing renders in STEP_3_BACKGROUND_VOICE to STEP_3_BACKGROUND
UPDATE orbix_renders
SET render_step = 'STEP_3_BACKGROUND'
WHERE render_step = 'STEP_3_BACKGROUND_VOICE';

-- Drop the old constraint
ALTER TABLE orbix_renders
DROP CONSTRAINT IF EXISTS orbix_renders_render_step_check;

-- Add new constraint with updated step names
ALTER TABLE orbix_renders
ADD CONSTRAINT orbix_renders_render_step_check 
CHECK (render_step IN (
  'PENDING',
  'STEP_3_BACKGROUND',        -- Background motion only
  'STEP_4_VOICE',             -- Voice/narration + music addition
  'STEP_5_HOOK_TEXT',         -- Impact/hook text addition (renamed from STEP_4)
  'STEP_6_CAPTIONS',          -- Caption/subtitle addition (renamed from STEP_5)
  'STEP_7_METADATA',          -- Caption and hashtag creation (renamed from STEP_6)
  'STEP_8_YOUTUBE_UPLOAD',    -- YouTube upload (renamed from STEP_7)
  'COMPLETED',
  'FAILED'
));

-- Add new column for step 4 video path (voice step output)
ALTER TABLE orbix_renders
ADD COLUMN IF NOT EXISTS video_step4_voice_path TEXT;

-- Note: video_step3_path now stores background-only video
-- video_step4_path stores voice-added video (old step3 output)
-- video_step4_path (old column) should be renamed to video_step5_path for hook text
-- But to avoid breaking changes, we'll keep the column names and update the code logic




