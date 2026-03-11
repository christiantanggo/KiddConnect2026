-- Fix movie_review_projects status check: app uses FAILED, constraint may only allow ERROR.
-- Run in Supabase SQL Editor if you see: violates check constraint "movie_review_projects_status_check"

ALTER TABLE movie_review_projects
  DROP CONSTRAINT IF EXISTS movie_review_projects_status_check;

ALTER TABLE movie_review_projects
  ADD CONSTRAINT movie_review_projects_status_check
  CHECK (status IN ('DRAFT', 'RENDERING', 'DONE', 'UPLOADING', 'PUBLISHED', 'FAILED', 'ERROR'));
