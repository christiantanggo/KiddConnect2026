-- Add updated_at to orbix_raw_items (required by generate-script and other Orbix updates)
-- Run this in Supabase SQL editor or via your migration runner.

ALTER TABLE orbix_raw_items
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

COMMENT ON COLUMN orbix_raw_items.updated_at IS 'Set on snippet/content updates and status changes';
