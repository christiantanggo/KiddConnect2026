-- Configurable "what the AI collects" + custom intake storage.
-- 1. Add custom_intake JSONB to store custom field values per request.
-- 2. intake_fields are stored in emergency_network_config.value (no schema change).

ALTER TABLE emergency_service_requests
  ADD COLUMN IF NOT EXISTS custom_intake JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN emergency_service_requests.custom_intake IS 'Custom intake field values (key -> value) from configurable AI collect fields.';
