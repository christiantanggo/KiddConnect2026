-- Provider billing: track charges per accepted lead (tier, SMS), Stripe customer per provider, send payment requests (invoices).
-- Run in Supabase SQL Editor.

-- ============================================================
-- 1. Provider charges (one row per accepted lead)
-- ============================================================
CREATE TABLE IF NOT EXISTS emergency_provider_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES emergency_providers(id) ON DELETE CASCADE,
  service_request_id UUID NOT NULL REFERENCES emergency_service_requests(id) ON DELETE CASCADE,
  dispatch_log_id UUID NOT NULL REFERENCES emergency_dispatch_log(id) ON DELETE CASCADE,
  priority_tier VARCHAR(20) NOT NULL CHECK (priority_tier IN ('premium', 'priority', 'basic')),
  sms_requested BOOLEAN NOT NULL DEFAULT FALSE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  stripe_invoice_id VARCHAR(255),
  stripe_invoice_item_id VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(dispatch_log_id)
);

CREATE INDEX IF NOT EXISTS idx_emergency_provider_charges_provider ON emergency_provider_charges(provider_id);
CREATE INDEX IF NOT EXISTS idx_emergency_provider_charges_unbilled ON emergency_provider_charges(provider_id) WHERE stripe_invoice_id IS NULL;

COMMENT ON TABLE emergency_provider_charges IS 'Billing line per lead accepted by a provider. amount_cents = tier price + (sms_fee if sms_requested).';
COMMENT ON COLUMN emergency_provider_charges.sms_requested IS 'True if provider requested SMS with request details after accepting.';
COMMENT ON COLUMN emergency_provider_charges.stripe_invoice_id IS 'Set when this charge is added to a sent Stripe invoice.';

-- ============================================================
-- 2. Stripe customer on provider (for sending invoices)
-- ============================================================
ALTER TABLE emergency_providers
  ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS email VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_emergency_providers_stripe_customer ON emergency_providers(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

COMMENT ON COLUMN emergency_providers.stripe_customer_id IS 'Stripe Customer ID for sending payment requests (invoices).';
COMMENT ON COLUMN emergency_providers.email IS 'Provider email; required for Stripe invoice delivery.';

-- ============================================================
-- 3. Billing config (price per lead by tier, SMS fee)
-- Stored in emergency_network_config.value.billing (JSON).
-- Defaults in application if not set: price_basic_cents=500, price_priority_cents=750, price_premium_cents=1000, sms_fee_cents=50
-- ============================================================
-- No new table; config is in emergency_network_config.value. Ensure key exists.
-- Example: UPDATE emergency_network_config SET value = value || '{"billing":{"price_basic_cents":500,"price_priority_cents":750,"price_premium_cents":1000,"sms_fee_cents":50}}'::jsonb WHERE key = 'settings';
-- Application will read value.billing and use defaults for missing keys.
