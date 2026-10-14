-- Optional per-module address overrides. When NULL, use business.address.
-- If this migration is not run, the app still works; Business.update() skips these columns.
-- phone_agent_address: e.g. head office for AI phone.
-- delivery_default_pickup_address: e.g. warehouse for delivery default pickup.
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS phone_agent_address TEXT,
  ADD COLUMN IF NOT EXISTS delivery_default_pickup_address TEXT;

COMMENT ON COLUMN businesses.phone_agent_address IS 'Address used by AI phone agent when set; otherwise business.address';
COMMENT ON COLUMN businesses.delivery_default_pickup_address IS 'Default pickup address for delivery module when set; otherwise business.address';
