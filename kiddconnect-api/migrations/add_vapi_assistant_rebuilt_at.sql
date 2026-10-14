-- Add vapi_assistant_rebuilt_at column to businesses table
ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS vapi_assistant_rebuilt_at TIMESTAMP;

COMMENT ON COLUMN businesses.vapi_assistant_rebuilt_at IS 'Timestamp when the VAPI assistant was last rebuilt';


