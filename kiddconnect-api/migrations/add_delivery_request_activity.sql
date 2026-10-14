-- Per-delivery audit: status transitions, dispatch reset/retry, request creation, operator-tagged actions.
-- GET /api/v2/delivery-network/requests/:id/activity

CREATE TABLE IF NOT EXISTS delivery_request_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_request_id UUID NOT NULL REFERENCES delivery_requests(id) ON DELETE CASCADE,
  activity_type VARCHAR(50) NOT NULL,
  from_status VARCHAR(50),
  to_status VARCHAR(50),
  source VARCHAR(30) NOT NULL,
  changed_by TEXT,
  detail JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_request_activity_request ON delivery_request_activity(delivery_request_id);
CREATE INDEX IF NOT EXISTS idx_delivery_request_activity_created ON delivery_request_activity(created_at DESC);

COMMENT ON TABLE delivery_request_activity IS 'Timeline for a delivery: status_change, request_created, dispatch_reset, dispatch_retry, etc.';
COMMENT ON COLUMN delivery_request_activity.source IS 'manual (dashboard PATCH), admin (operator UI), system (dispatch/automation), webhook (DoorDash/Shipday push)';
COMMENT ON COLUMN delivery_request_activity.detail IS 'Optional JSON, e.g. { "event_name": "DASHER_PICKED_UP", "broker": "doordash" }';
