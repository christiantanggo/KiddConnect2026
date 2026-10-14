-- Add SMS consent tracking to contacts table
-- Required for TCPA compliance - must track when and how users consented

ALTER TABLE contacts 
ADD COLUMN IF NOT EXISTS sms_consent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS sms_consent_timestamp TIMESTAMP,
ADD COLUMN IF NOT EXISTS sms_consent_method VARCHAR(50), -- 'web_form', 'text_in', 'paper_form', 'phone', etc.
ADD COLUMN IF NOT EXISTS sms_consent_ip_address VARCHAR(45), -- IPv4 or IPv6
ADD COLUMN IF NOT EXISTS sms_consent_source VARCHAR(255), -- URL or source where consent was given
ADD COLUMN IF NOT EXISTS double_opt_in_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS double_opt_in_verified_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS last_sms_sent_at TIMESTAMP, -- For frequency limiting
ADD COLUMN IF NOT EXISTS sms_message_count INTEGER DEFAULT 0, -- Total messages sent to this contact
ADD COLUMN IF NOT EXISTS sms_message_count_this_week INTEGER DEFAULT 0, -- Messages this week (for frequency limits)
ADD COLUMN IF NOT EXISTS sms_message_count_this_month INTEGER DEFAULT 0; -- Messages this month

-- Add index for efficient consent queries
CREATE INDEX IF NOT EXISTS idx_contacts_sms_consent ON contacts(business_id, sms_consent) WHERE sms_consent = TRUE;
CREATE INDEX IF NOT EXISTS idx_contacts_last_sms_sent ON contacts(business_id, last_sms_sent_at);

-- Add comment explaining consent tracking
COMMENT ON COLUMN contacts.sms_consent IS 'TCPA requirement: Explicit consent to receive SMS messages';
COMMENT ON COLUMN contacts.sms_consent_timestamp IS 'When the user consented (required for compliance audits)';
COMMENT ON COLUMN contacts.sms_consent_method IS 'How consent was obtained (web_form, text_in, paper_form, etc.)';
COMMENT ON COLUMN contacts.sms_consent_ip_address IS 'IP address when consent was given (for compliance proof)';
COMMENT ON COLUMN contacts.sms_consent_source IS 'Source/URL where consent was obtained';

