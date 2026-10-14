-- Store last render error message for long-form videos so the UI can show why a render failed.
ALTER TABLE orbix_longform_videos
  ADD COLUMN IF NOT EXISTS render_error TEXT;

COMMENT ON COLUMN orbix_longform_videos.render_error IS 'Last error message when render_status is FAILED; cleared when starting a new render or on reset.';
