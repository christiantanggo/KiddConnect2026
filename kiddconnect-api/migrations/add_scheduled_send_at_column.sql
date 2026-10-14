-- Add scheduled_send_at and error_message columns to sms_campaign_recipients
-- These columns are used for queuing messages blocked by quiet hours

ALTER TABLE sms_campaign_recipients
ADD COLUMN IF NOT EXISTS scheduled_send_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Add index for efficient querying of queued recipients
CREATE INDEX IF NOT EXISTS idx_sms_campaign_recipients_scheduled_send_at 
ON sms_campaign_recipients(scheduled_send_at) 
WHERE scheduled_send_at IS NOT NULL;

-- Add index for status queries
CREATE INDEX IF NOT EXISTS idx_sms_campaign_recipients_status_scheduled 
ON sms_campaign_recipients(status, scheduled_send_at) 
WHERE status = 'queued';

-- Add comment explaining the columns
COMMENT ON COLUMN sms_campaign_recipients.scheduled_send_at IS 'Timestamp when a queued message should be sent (used for quiet hours compliance)';
COMMENT ON COLUMN sms_campaign_recipients.error_message IS 'Error message if message sending failed or was blocked';

