-- Add PENDING status to orbix_stories status constraint
-- This allows stories to be created with PENDING status (instead of QUEUED)

ALTER TABLE orbix_stories
DROP CONSTRAINT IF EXISTS orbix_stories_status_check;

ALTER TABLE orbix_stories
ADD CONSTRAINT orbix_stories_status_check
CHECK (status IN ('QUEUED', 'PENDING', 'REJECTED', 'APPROVED', 'RENDERED', 'PUBLISHED'));




