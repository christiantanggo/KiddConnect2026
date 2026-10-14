-- Allow category-specific render step values (DADJOKE_RENDER, TRIVIA_RENDER, etc.)
-- so updateStepStatus() in dadjoke/trivia/trickquestion renderers can persist step_progress.
-- Without this, the CHECK constraint rejected updates and the progress bar stayed at 0.

ALTER TABLE orbix_renders
DROP CONSTRAINT IF EXISTS orbix_renders_render_step_check;

ALTER TABLE orbix_renders
ADD CONSTRAINT orbix_renders_render_step_check
CHECK (render_step IN (
  'PENDING',
  'STEP_3_BACKGROUND',
  'STEP_4_VOICE',
  'STEP_4_VOICE_MUSIC_ADDITION',
  'STEP_5_HOOK_TEXT',
  'STEP_6_CAPTIONS',
  'STEP_7_METADATA',
  'STEP_8_YOUTUBE_UPLOAD',
  'COMPLETED',
  'FAILED',
  'DADJOKE_RENDER',
  'TRIVIA_RENDER',
  'TRICKQUESTION_RENDER',
  'RIDDLE_RENDER',
  'MINDTEASER_RENDER',
  'FACTS_RENDER'
));
