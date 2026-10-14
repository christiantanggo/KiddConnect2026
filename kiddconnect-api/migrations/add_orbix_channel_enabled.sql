-- Allow disabling channels so they are skipped by pipeline and publish (saves YouTube quota).
-- Default true = current behavior.

ALTER TABLE orbix_channels
  ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT true;

COMMENT ON COLUMN orbix_channels.enabled IS 'When false, pipeline and publish skip this channel (no new renders, no YouTube uploads).';
