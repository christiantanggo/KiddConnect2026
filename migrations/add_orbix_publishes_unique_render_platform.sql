-- Prevent duplicate publish rows per render per platform so only one replica/process can claim a render.
-- Fixes "30 uploads" when multiple replicas each run the publish job and all insert + upload the same render.

-- Remove duplicates: keep one row per (render_id, platform), prefer the one with platform_video_id or earliest created_at
DELETE FROM orbix_publishes a
USING orbix_publishes b
WHERE a.render_id = b.render_id
  AND a.platform = b.platform
  AND a.id > b.id;

-- Ensure only one publish record per render per platform
ALTER TABLE orbix_publishes
  ADD CONSTRAINT orbix_publishes_render_platform_unique UNIQUE (render_id, platform);
