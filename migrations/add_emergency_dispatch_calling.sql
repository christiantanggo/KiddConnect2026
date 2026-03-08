-- Emergency Network: allow pending dispatch attempts and track outbound dispatch calls
-- so we can correlate VAPI call-end/function-call with request_id and provider_id.
--
-- Run this on production Supabase if "Call plumber" fails with:
--   violates check constraint "emergency_dispatch_log_result_check"

-- Allow 'pending' and NULL in dispatch_log.result (attempt in progress)
ALTER TABLE emergency_dispatch_log
  DROP CONSTRAINT IF EXISTS emergency_dispatch_log_result_check;

ALTER TABLE emergency_dispatch_log
  ADD CONSTRAINT emergency_dispatch_log_result_check
  CHECK (result IS NULL OR result IN ('accepted', 'declined', 'no_answer', 'error', 'pending'));

-- Optional: table to look up request_id/provider_id by VAPI call ID (if metadata not in webhook)
CREATE TABLE IF NOT EXISTS emergency_dispatch_calls (
  vapi_call_id VARCHAR(255) PRIMARY KEY,
  service_request_id UUID NOT NULL REFERENCES emergency_service_requests(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES emergency_providers(id) ON DELETE CASCADE,
  dispatch_log_id UUID REFERENCES emergency_dispatch_log(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emergency_dispatch_calls_request ON emergency_dispatch_calls(service_request_id);
