-- Add progress_percentage column to orbix_renders table
ALTER TABLE orbix_renders 
ADD COLUMN IF NOT EXISTS progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100);

-- Add index for faster queries on progress
CREATE INDEX IF NOT EXISTS idx_orbix_renders_progress ON orbix_renders(progress_percentage);

