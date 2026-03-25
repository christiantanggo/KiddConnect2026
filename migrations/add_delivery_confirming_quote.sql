-- Staged on-demand quote: user confirms price before /on-demand/assign; deny deletes Shipday order.
-- pending_on_demand_snapshot: { name, estimate_id, fee_usd, amount_cents, final_price_cad, disclaimer } (name is for assign only, not shown in dashboard API)

ALTER TABLE delivery_requests DROP CONSTRAINT IF EXISTS delivery_requests_status_check;

ALTER TABLE delivery_requests ADD CONSTRAINT delivery_requests_status_check CHECK (status IN (
  'New',
  'Contacting',
  'ChoosingCarrier',
  'ConfirmingDelivery',
  'Dispatched',
  'Assigned',
  'PickedUp',
  'Completed',
  'Failed',
  'Cancelled',
  'Needs Manual Assist'
));

ALTER TABLE delivery_requests
  ADD COLUMN IF NOT EXISTS pending_on_demand_snapshot JSONB DEFAULT NULL;

COMMENT ON COLUMN delivery_requests.pending_on_demand_snapshot IS 'Shipday on-demand assign payload + display quote; cleared after confirm or reject';
