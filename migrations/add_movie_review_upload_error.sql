-- Store YouTube upload failure message so the UI can display it
ALTER TABLE movie_review_projects
  ADD COLUMN IF NOT EXISTS upload_error TEXT;

COMMENT ON COLUMN movie_review_projects.upload_error IS 'Last YouTube upload error message when status is FAILED.';
