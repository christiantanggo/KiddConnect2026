-- Add SMS time settings to businesses table
-- These settings allow businesses to control when SMS campaigns can be sent

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS sms_business_hours_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS sms_business_hours JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS sms_timezone VARCHAR(50) DEFAULT 'America/New_York',
ADD COLUMN IF NOT EXISTS sms_allowed_start_time TIME DEFAULT '09:00:00',
ADD COLUMN IF NOT EXISTS sms_allowed_end_time TIME DEFAULT '21:00:00';

-- Example sms_business_hours format:
-- {
--   "monday": { "enabled": true, "start": "09:00", "end": "17:00" },
--   "tuesday": { "enabled": true, "start": "09:00", "end": "17:00" },
--   ...
-- }

