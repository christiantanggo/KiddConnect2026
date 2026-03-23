-- Allow "ChoosingCarrier" while the customer picks a third-party provider (on-demand) before assignment.

ALTER TABLE delivery_requests DROP CONSTRAINT IF EXISTS delivery_requests_status_check;

ALTER TABLE delivery_requests ADD CONSTRAINT delivery_requests_status_check CHECK (status IN (
  'New',
  'Contacting',
  'ChoosingCarrier',
  'Dispatched',
  'Assigned',
  'PickedUp',
  'Completed',
  'Failed',
  'Cancelled',
  'Needs Manual Assist'
));
