-- Log request-level activity: dispatch reset and status changes (manual vs AI)
-- so the dashboard modal can show "Dispatch reset", "Status changed from X to Y (by staff / by AI)"

CREATE TABLE IF NOT EXISTS emergency_request_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id UUID NOT NULL REFERENCES emergency_service_requests(id) ON DELETE CASCADE,
  activity_type VARCHAR(50) NOT NULL CHECK (activity_type IN ('dispatch_reset', 'status_change')),
  from_status VARCHAR(50),
  to_status VARCHAR(50),
  source VARCHAR(20) NOT NULL CHECK (source IN ('manual', 'ai')),
  changed_by TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emergency_request_activity_request ON emergency_request_activity(service_request_id);
CREATE INDEX IF NOT EXISTS idx_emergency_request_activity_created ON emergency_request_activity(created_at DESC);

COMMENT ON TABLE emergency_request_activity IS 'Audit log for emergency request: dispatch resets and status changes (manual = dashboard, ai = VAPI/dispatch).';
