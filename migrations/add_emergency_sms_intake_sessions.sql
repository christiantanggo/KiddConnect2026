-- Emergency Network: SMS intake conversation state (collect name, service type, urgency, location, issue before dispatch).
-- One row per customer phone per emergency line; updated on each reply until complete or expiry.

CREATE TABLE IF NOT EXISTS emergency_sms_intake_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_phone VARCHAR(50) NOT NULL,
  to_phone VARCHAR(50) NOT NULL,
  step VARCHAR(50) NOT NULL DEFAULT 'name',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (from_phone, to_phone)
);

CREATE INDEX IF NOT EXISTS idx_emergency_sms_intake_sessions_updated
  ON emergency_sms_intake_sessions(updated_at);

COMMENT ON TABLE emergency_sms_intake_sessions IS 'In-progress SMS intake per customer; step: name, service_type, urgency, location, issue. data: caller_name, service_category, etc.';
