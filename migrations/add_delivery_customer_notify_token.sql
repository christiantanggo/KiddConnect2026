-- Secret token for public delivery status + POD page (SMS/email links without login).
ALTER TABLE delivery_requests
  ADD COLUMN IF NOT EXISTS customer_notify_token VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_requests_customer_notify_token
  ON delivery_requests (customer_notify_token)
  WHERE customer_notify_token IS NOT NULL;

COMMENT ON COLUMN delivery_requests.customer_notify_token IS 'Opaque token for GET /api/v2/delivery-network/public/delivery/:token (customer notifications)';
