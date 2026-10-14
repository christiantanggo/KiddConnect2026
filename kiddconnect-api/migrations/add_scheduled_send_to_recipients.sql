-- Add scheduled_send_at column to sms_campaign_recipients table
-- This allows queuing recipients blocked by quiet hours for later sending

ALTER TABLE sms_campaign_recipients 
ADD COLUMN IF NOT EXISTS scheduled_send_at TIMESTAMP;

-- Add index for efficient querying of queued recipients
CREATE INDEX IF NOT EXISTS idx_sms_campaign_recipients_scheduled 
ON sms_campaign_recipients(scheduled_send_at) 
WHERE status = 'queued' AND scheduled_send_at IS NOT NULL;

-- Update status enum to include 'queued' (if using enum type)
-- Note: If status is VARCHAR, no enum update needed

