-- Emergency Network: store intake call transcript and allow providers to view via link (SMS/email).
-- Transcript is shown at GET /api/v2/emergency-network/public/transcript/:token (no auth).
-- RLS: the public transcript route uses server-side Supabase; no anon RLS needed. If you want
-- direct Supabase anon access later, add a SECURITY DEFINER function that returns transcript by token.

ALTER TABLE emergency_service_requests
  ADD COLUMN IF NOT EXISTS intake_transcript TEXT,
  ADD COLUMN IF NOT EXISTS transcript_access_token VARCHAR(64) UNIQUE;

CREATE INDEX IF NOT EXISTS idx_emergency_service_requests_transcript_token
  ON emergency_service_requests(transcript_access_token)
  WHERE transcript_access_token IS NOT NULL;

COMMENT ON COLUMN emergency_service_requests.intake_transcript IS 'Full transcript from the customer intake call (phone).';
COMMENT ON COLUMN emergency_service_requests.transcript_access_token IS 'Secret token for public transcript view link (SMS/email to provider).';
