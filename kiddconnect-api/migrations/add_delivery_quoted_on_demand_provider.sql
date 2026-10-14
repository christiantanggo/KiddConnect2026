-- Store which on-demand provider (e.g. DoorDash, Uber) was used for the quote so dispatch assigns to the same provider.
-- Run in Supabase SQL Editor.

ALTER TABLE delivery_requests
  ADD COLUMN IF NOT EXISTS quoted_on_demand_provider VARCHAR(50) DEFAULT NULL;

COMMENT ON COLUMN delivery_requests.quoted_on_demand_provider IS 'Third-party name from quote (e.g. DoorDash, Uber) so dispatch assigns to the same provider.';
