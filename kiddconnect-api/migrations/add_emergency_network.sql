-- Tavari Emergency Network: config, service requests, providers, dispatch log, module
-- Run in Supabase SQL Editor. Does not touch existing agent or businesses.

-- ============================================================
-- CONFIG (single row: emergency phone numbers + VAPI assistant id)
-- ============================================================
CREATE TABLE IF NOT EXISTS emergency_network_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) UNIQUE NOT NULL,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emergency_network_config_key ON emergency_network_config(key);

-- Seed: emergency_phone_numbers = array of E.164 strings, emergency_vapi_assistant_id = VAPI assistant id
INSERT INTO emergency_network_config (key, value, updated_at) VALUES
  ('settings', '{"emergency_phone_numbers": [], "emergency_vapi_assistant_id": null, "max_dispatch_attempts": 5}'::jsonb, NOW())
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- SERVICE REQUESTS (consumer intake)
-- ============================================================
CREATE TABLE IF NOT EXISTS emergency_service_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_name VARCHAR(255),
  callback_phone VARCHAR(50) NOT NULL,
  service_category VARCHAR(50) NOT NULL CHECK (service_category IN ('Plumbing', 'HVAC', 'Gas', 'Other')),
  urgency_level VARCHAR(50) NOT NULL CHECK (urgency_level IN ('Immediate Emergency', 'Same Day', 'Schedule')),
  location VARCHAR(500),
  issue_summary TEXT,
  preferred_contact_method VARCHAR(50),
  access_notes TEXT,
  intake_channel VARCHAR(20) NOT NULL CHECK (intake_channel IN ('phone', 'sms', 'form')),
  status VARCHAR(50) NOT NULL DEFAULT 'New' CHECK (status IN (
    'New', 'Contacting Providers', 'Accepted', 'Connected', 'Closed', 'Needs Manual Assist'
  )),
  accepted_provider_id UUID,
  connected_at TIMESTAMP,
  closed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emergency_service_requests_status ON emergency_service_requests(status);
CREATE INDEX IF NOT EXISTS idx_emergency_service_requests_created_at ON emergency_service_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_emergency_service_requests_service_category ON emergency_service_requests(service_category);

-- ============================================================
-- PROVIDERS (trade professionals in directory)
-- ============================================================
CREATE TABLE IF NOT EXISTS emergency_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name VARCHAR(255) NOT NULL,
  trade_type VARCHAR(50) NOT NULL,
  service_areas TEXT[] DEFAULT '{}',
  phone VARCHAR(50) NOT NULL,
  verification_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified')),
  priority_tier VARCHAR(20) NOT NULL DEFAULT 'basic' CHECK (priority_tier IN ('premium', 'priority', 'basic')),
  is_available BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emergency_providers_trade_type ON emergency_providers(trade_type);
CREATE INDEX IF NOT EXISTS idx_emergency_providers_verification ON emergency_providers(verification_status);
CREATE INDEX IF NOT EXISTS idx_emergency_providers_available ON emergency_providers(is_available);

-- ============================================================
-- DISPATCH LOG (per-request provider attempts)
-- ============================================================
CREATE TABLE IF NOT EXISTS emergency_dispatch_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id UUID NOT NULL REFERENCES emergency_service_requests(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES emergency_providers(id) ON DELETE CASCADE,
  attempt_order INTEGER NOT NULL,
  result VARCHAR(50) CHECK (result IN ('accepted', 'declined', 'no_answer', 'error')),
  attempted_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emergency_dispatch_log_request ON emergency_dispatch_log(service_request_id);

-- ============================================================
-- MODULE: Emergency Dispatch (admin)
-- ============================================================
INSERT INTO modules (key, name, description, category, is_active, health_status, version, metadata, created_at, updated_at)
VALUES (
  'emergency-dispatch',
  'Emergency Dispatch',
  '24/7 Emergency & Priority Service Network — lead gen and dispatch for plumbing, HVAC, gas',
  'communication',
  TRUE,
  'healthy',
  '1.0.0',
  '{}'::jsonb,
  NOW(),
  NOW()
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  is_active = EXCLUDED.is_active,
  health_status = EXCLUDED.health_status,
  version = EXCLUDED.version,
  updated_at = NOW();
