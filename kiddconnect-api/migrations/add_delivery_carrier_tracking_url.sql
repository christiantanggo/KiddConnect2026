-- Customer-facing carrier tracking page (Shipday trackingLink, DoorDash tracking_url, etc.)
ALTER TABLE delivery_requests
  ADD COLUMN IF NOT EXISTS carrier_tracking_url TEXT;

COMMENT ON COLUMN delivery_requests.carrier_tracking_url IS 'Public tracking URL from the carrier (e.g. Shipday trackingLink, DoorDash tracking_url)';
