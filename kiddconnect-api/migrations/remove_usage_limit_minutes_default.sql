-- Remove default value from usage_limit_minutes column
-- This ensures users don't get free minutes if payment fails
-- Minutes should ONLY be set when a package is successfully purchased

ALTER TABLE businesses 
ALTER COLUMN usage_limit_minutes DROP DEFAULT;

-- Add comment explaining this column must be set via package purchase
COMMENT ON COLUMN businesses.usage_limit_minutes IS 'Minutes included in the purchased package. NULL means no package purchased. Must be set via Stripe webhook when payment succeeds.';


