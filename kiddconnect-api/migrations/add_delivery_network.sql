-- Tavari Delivery Network: config, approved numbers, saved locations, requests, dispatch log, module
-- Run in Supabase SQL Editor. Does not touch emergency or existing tables.
-- Plan: docs/DELIVERY_MODULE_BUILD_PLAN.md §5

-- ============================================================
-- GLOBAL CONFIG (delivery line numbers + VAPI assistant id)
-- ============================================================
CREATE TABLE IF NOT EXISTS delivery_network_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) UNIQUE NOT NULL,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_network_config_key ON delivery_network_config(key);

INSERT INTO delivery_network_config (key, value, updated_at) VALUES
  ('settings', '{"delivery_phone_numbers": [], "delivery_vapi_assistant_id": null}'::jsonb, NOW())
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- PER-BUSINESS CONFIG (notification prefs, pricing, limits, etc.)
-- ============================================================
CREATE TABLE IF NOT EXISTS delivery_business_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(business_id)
);

CREATE INDEX IF NOT EXISTS idx_delivery_business_config_business ON delivery_business_config(business_id);

-- ============================================================
-- APPROVED CALLER NUMBERS (per business; used to resolve business from caller)
-- ============================================================
CREATE TABLE IF NOT EXISTS delivery_approved_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  phone_number VARCHAR(50) NOT NULL,
  label VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_approved_numbers_business ON delivery_approved_numbers(business_id);
CREATE INDEX IF NOT EXISTS idx_delivery_approved_numbers_phone ON delivery_approved_numbers(phone_number);

-- ============================================================
-- APPROVAL REQUESTS (when caller not approved; owner Approve / Approve all / Deny)
-- ============================================================
CREATE TABLE IF NOT EXISTS delivery_approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  caller_phone VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_approval_requests_business ON delivery_approval_requests(business_id);
CREATE INDEX IF NOT EXISTS idx_delivery_approval_requests_status ON delivery_approval_requests(status);

-- ============================================================
-- SMS INTAKE SESSIONS (conversation state for SMS/chat intake)
-- ============================================================
CREATE TABLE IF NOT EXISTS delivery_sms_intake_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_phone VARCHAR(50) NOT NULL,
  to_phone VARCHAR(50) NOT NULL,
  step VARCHAR(50) NOT NULL DEFAULT 'start',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (from_phone, to_phone)
);

CREATE INDEX IF NOT EXISTS idx_delivery_sms_intake_sessions_updated ON delivery_sms_intake_sessions(updated_at);

-- ============================================================
-- SAVED LOCATIONS (default pickup, named pickups, frequent addresses)
-- ============================================================
CREATE TABLE IF NOT EXISTS delivery_saved_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL CHECK (type IN ('default_pickup', 'named_pickup', 'frequent_delivery')),
  name VARCHAR(255),
  address TEXT,
  contact VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_saved_locations_business ON delivery_saved_locations(business_id);

-- ============================================================
-- DELIVERY REQUESTS (main record; business_id NULL for individuals)
-- ============================================================
CREATE TABLE IF NOT EXISTS delivery_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  caller_phone VARCHAR(50),
  callback_phone VARCHAR(50) NOT NULL,
  reference_number VARCHAR(20) UNIQUE NOT NULL,
  -- Pickup
  pickup_address TEXT,
  pickup_contact VARCHAR(255),
  pickup_callback VARCHAR(50),
  pickup_location_id UUID REFERENCES delivery_saved_locations(id) ON DELETE SET NULL,
  -- Delivery
  delivery_type VARCHAR(20) CHECK (delivery_type IN ('business', 'residential')),
  delivery_business_name VARCHAR(255),
  delivery_address TEXT NOT NULL,
  recipient_name VARCHAR(255),
  recipient_phone VARCHAR(50),
  -- Package
  package_description TEXT,
  package_size VARCHAR(100),
  package_weight VARCHAR(100),
  special_instructions TEXT,
  -- Priority & status
  priority VARCHAR(30) NOT NULL DEFAULT 'Schedule' CHECK (priority IN ('Immediate', 'Same Day', 'Schedule')),
  status VARCHAR(50) NOT NULL DEFAULT 'New' CHECK (status IN (
    'New', 'Contacting', 'Dispatched', 'Assigned', 'PickedUp', 'Completed', 'Failed', 'Cancelled', 'Needs Manual Assist'
  )),
  intake_channel VARCHAR(20) NOT NULL DEFAULT 'form' CHECK (intake_channel IN ('phone', 'sms', 'form', 'chat', 'api')),
  payment_status VARCHAR(30) DEFAULT NULL CHECK (payment_status IS NULL OR payment_status IN ('pending_payment', 'paid')),
  stripe_payment_link_id VARCHAR(255),
  amount_quoted_cents INTEGER,
  intake_transcript TEXT,
  transcript_access_token VARCHAR(64),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_requests_business ON delivery_requests(business_id);
CREATE INDEX IF NOT EXISTS idx_delivery_requests_status ON delivery_requests(status);
CREATE INDEX IF NOT EXISTS idx_delivery_requests_created_at ON delivery_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_requests_reference ON delivery_requests(reference_number);
CREATE INDEX IF NOT EXISTS idx_delivery_requests_cancellation ON delivery_requests(caller_phone, delivery_address, created_at);

-- ============================================================
-- DISPATCH LOG (per-request broker attempts)
-- ============================================================
CREATE TABLE IF NOT EXISTS delivery_dispatch_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_request_id UUID NOT NULL REFERENCES delivery_requests(id) ON DELETE CASCADE,
  broker_id VARCHAR(50) NOT NULL,
  attempt_order INTEGER NOT NULL,
  result VARCHAR(50) CHECK (result IN ('accepted', 'no_driver', 'timeout', 'error', 'pending')),
  broker_job_id VARCHAR(255),
  cost_quote_cents INTEGER,
  attempted_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_dispatch_log_request ON delivery_dispatch_log(delivery_request_id);

-- Optional: outbound call tracking (e.g. operator-initiated)
CREATE TABLE IF NOT EXISTS delivery_dispatch_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vapi_call_id VARCHAR(255),
  delivery_request_id UUID REFERENCES delivery_requests(id) ON DELETE CASCADE,
  dispatch_log_id UUID REFERENCES delivery_dispatch_log(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_dispatch_calls_request ON delivery_dispatch_calls(delivery_request_id);

-- ============================================================
-- MODULE: Delivery Dispatch
-- ============================================================
INSERT INTO modules (key, name, description, category, is_active, health_status, version, metadata, created_at, updated_at)
VALUES (
  'delivery-dispatch',
  'Last-Mile Delivery',
  'Schedule package pick-up and delivery with AI phone, SMS, chat, and dashboard. Multi-broker dispatch.',
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
