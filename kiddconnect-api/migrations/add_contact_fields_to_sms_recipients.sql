-- Add email, first_name, last_name columns to sms_campaign_recipients table
-- Run this if the table already exists

ALTER TABLE sms_campaign_recipients
ADD COLUMN IF NOT EXISTS email VARCHAR(255),
ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS last_name VARCHAR(100);

