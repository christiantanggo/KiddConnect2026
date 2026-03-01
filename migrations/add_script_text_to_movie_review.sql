-- Add script_text column to movie_review_projects
-- Run in Supabase SQL Editor → New Query

ALTER TABLE movie_review_projects
  ADD COLUMN IF NOT EXISTS script_text TEXT;
