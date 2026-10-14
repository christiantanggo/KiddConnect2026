-- Per-channel background images: store path in bucket when using channel-specific image.
-- When NULL, render uses legacy global image Photo{background_id}.png.

ALTER TABLE orbix_renders
  ADD COLUMN IF NOT EXISTS background_storage_path TEXT;

COMMENT ON COLUMN orbix_renders.background_storage_path IS 'Storage path for per-channel background (e.g. business_id/channel_id/filename.png). When NULL, use global Photo{background_id}.png.';
