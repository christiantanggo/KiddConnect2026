-- Add kiosk access token to businesses table
-- This allows kitchen staff to access the kiosk without logging in

ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS kiosk_access_token VARCHAR(255) UNIQUE,
ADD COLUMN IF NOT EXISTS kiosk_token_created_at TIMESTAMP;

-- Add index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_businesses_kiosk_token 
ON businesses(kiosk_access_token) 
WHERE kiosk_access_token IS NOT NULL;

-- Add comment
COMMENT ON COLUMN businesses.kiosk_access_token IS 'Long-lived token for kiosk access. Generated from dashboard and embedded in kiosk app.';
COMMENT ON COLUMN businesses.kiosk_token_created_at IS 'Timestamp when kiosk token was last generated/regenerated.';

