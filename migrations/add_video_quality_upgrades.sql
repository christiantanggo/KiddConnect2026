-- migrations/add_video_quality_upgrades.sql
-- Add fields for video quality upgrades (motion type, music track, hook text)

ALTER TABLE orbix_renders 
  ADD COLUMN IF NOT EXISTS motion_type VARCHAR(20),
  ADD COLUMN IF NOT EXISTS music_track_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS hook_text TEXT;

COMMENT ON COLUMN orbix_renders.motion_type IS 'Motion type applied: zoom-in, zoom-out, pan-left, pan-right, pan-up, pan-down, zoom-pan';
COMMENT ON COLUMN orbix_renders.music_track_name IS 'Name of music track used for this render';
COMMENT ON COLUMN orbix_renders.hook_text IS 'Hook text displayed in video (stored for reference)';




