-- Track when details were emailed or SMS'd to a provider for a dispatch call
-- (so the dashboard can show "Email sent at ...", "SMS sent at ..." per call-out)

ALTER TABLE emergency_dispatch_log
  ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sms_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN emergency_dispatch_log.email_sent_at IS 'When request details were emailed to this provider (after they accepted and chose email).';
COMMENT ON COLUMN emergency_dispatch_log.sms_sent_at IS 'When request details were texted to this provider (after they accepted and chose SMS).';
