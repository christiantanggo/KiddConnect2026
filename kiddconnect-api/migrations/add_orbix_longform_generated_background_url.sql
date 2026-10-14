-- Store URL of the user-approved generated background image for dad joke long-form videos.
-- When set, the renderer uses this image instead of generating a new one at render time.
ALTER TABLE orbix_longform_videos
  ADD COLUMN IF NOT EXISTS generated_background_url TEXT;

COMMENT ON COLUMN orbix_longform_videos.generated_background_url IS 'Public URL of the DALL-E generated background image (user can generate/approve before render).';
