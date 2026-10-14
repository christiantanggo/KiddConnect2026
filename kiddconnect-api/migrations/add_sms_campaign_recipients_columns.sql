-- Add missing columns to sms_campaign_recipients table if they don't exist
-- This migration ensures email, first_name, and last_name columns exist

ALTER TABLE sms_campaign_recipients
ADD COLUMN IF NOT EXISTS email VARCHAR(255),
ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS last_name VARCHAR(100);

