-- Add SMS notification columns to businesses table
-- These columns are used for Step 4 of the setup wizard (Notification Settings)

ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS sms_business_hours_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS sms_timezone VARCHAR(50) DEFAULT 'America/New_York',
ADD COLUMN IF NOT EXISTS sms_allowed_start_time TIME DEFAULT '09:00:00',
ADD COLUMN IF NOT EXISTS sms_allowed_end_time TIME DEFAULT '21:00:00';

-- Add comment to document these columns
COMMENT ON COLUMN businesses.sms_business_hours_enabled IS 'Whether SMS notifications should only be sent during business hours';
COMMENT ON COLUMN businesses.sms_timezone IS 'Timezone for SMS notification hours (e.g., America/New_York)';
COMMENT ON COLUMN businesses.sms_allowed_start_time IS 'Earliest time to send SMS notifications (HH:MM:SS format)';
COMMENT ON COLUMN businesses.sms_allowed_end_time IS 'Latest time to send SMS notifications (HH:MM:SS format)';




