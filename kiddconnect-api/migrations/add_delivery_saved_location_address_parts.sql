-- Structured address fields for delivery_saved_locations (quick-fill on Request a pickup).
-- Legacy rows may still have only `address` (TEXT); app parses when parts are null.

ALTER TABLE delivery_saved_locations
  ADD COLUMN IF NOT EXISTS address_line TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS province TEXT,
  ADD COLUMN IF NOT EXISTS postal_code TEXT;
