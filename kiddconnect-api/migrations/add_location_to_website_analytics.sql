-- Add location column to website_analytics table (if it doesn't exist)
-- This migration adds the location column for existing tables

ALTER TABLE website_analytics
ADD COLUMN IF NOT EXISTS location VARCHAR(255);

-- Add index for location queries
CREATE INDEX IF NOT EXISTS idx_website_analytics_location ON website_analytics(location);

