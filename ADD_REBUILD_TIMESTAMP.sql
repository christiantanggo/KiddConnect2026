-- Add vapi_assistant_rebuilt_at column to businesses table
-- This tracks when the AI assistant was last rebuilt

ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS vapi_assistant_rebuilt_at TIMESTAMP;

-- Add comment
COMMENT ON COLUMN businesses.vapi_assistant_rebuilt_at IS 'Timestamp of when the VAPI assistant was last rebuilt';













