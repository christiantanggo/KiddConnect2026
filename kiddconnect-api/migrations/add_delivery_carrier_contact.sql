-- Driver/dasher contact when the broker exposes it (often a masked or relay number, not the driver’s personal line).
ALTER TABLE delivery_requests
  ADD COLUMN IF NOT EXISTS carrier_contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS carrier_contact_name TEXT;

COMMENT ON COLUMN delivery_requests.carrier_contact_phone IS 'From Shipday assignedCarrier or DoorDash dasher_dropoff_phone_number when available.';
COMMENT ON COLUMN delivery_requests.carrier_contact_name IS 'Driver display name from broker when available (e.g. Shipday progress, DoorDash dasher_name).';
