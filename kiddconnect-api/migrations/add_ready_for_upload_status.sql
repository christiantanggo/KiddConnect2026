-- Allow render to stop after step 7; YouTube upload runs in a separate job
ALTER TABLE orbix_renders
DROP CONSTRAINT IF EXISTS orbix_renders_render_status_check;

ALTER TABLE orbix_renders
ADD CONSTRAINT orbix_renders_render_status_check
CHECK (render_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'STEP_FAILED', 'READY_FOR_UPLOAD'));

COMMENT ON COLUMN orbix_renders.render_status IS 'READY_FOR_UPLOAD = render done, video in output_url (storage); separate job runs YouTube upload.';
