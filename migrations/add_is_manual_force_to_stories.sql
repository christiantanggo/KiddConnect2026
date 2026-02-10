-- Add field to track if a story was manually forced through by a user
ALTER TABLE orbix_stories
ADD COLUMN IF NOT EXISTS is_manual_force BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_orbix_stories_is_manual_force ON orbix_stories(is_manual_force) WHERE is_manual_force = TRUE;




