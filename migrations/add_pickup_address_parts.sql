-- Structured pickup address for accurate Shipday distance/geocoding.
-- pickup_address remains street/address line 1; add city, province, postal code.
ALTER TABLE delivery_requests
  ADD COLUMN IF NOT EXISTS pickup_city VARCHAR(100),
  ADD COLUMN IF NOT EXISTS pickup_province VARCHAR(50),
  ADD COLUMN IF NOT EXISTS pickup_postal_code VARCHAR(20);

COMMENT ON COLUMN delivery_requests.pickup_city IS 'Pickup city for structured address sent to Shipday';
COMMENT ON COLUMN delivery_requests.pickup_province IS 'Pickup province/state (e.g. ON, BC)';
COMMENT ON COLUMN delivery_requests.pickup_postal_code IS 'Pickup postal/zip code';

-- Structured delivery address (same as pickup).
-- delivery_address remains street/address line 1; add city, province, postal code.
ALTER TABLE delivery_requests
  ADD COLUMN IF NOT EXISTS delivery_city VARCHAR(100),
  ADD COLUMN IF NOT EXISTS delivery_province VARCHAR(50),
  ADD COLUMN IF NOT EXISTS delivery_postal_code VARCHAR(20);

COMMENT ON COLUMN delivery_requests.delivery_city IS 'Delivery city for structured address sent to Shipday';
COMMENT ON COLUMN delivery_requests.delivery_province IS 'Delivery province/state (e.g. ON, BC)';
COMMENT ON COLUMN delivery_requests.delivery_postal_code IS 'Delivery postal/zip code';
