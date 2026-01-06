-- Add takeout orders enabled flag to businesses table
ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS takeout_orders_enabled BOOLEAN DEFAULT FALSE;

-- Add index for filtering businesses with takeout orders enabled
CREATE INDEX IF NOT EXISTS idx_businesses_takeout_orders_enabled 
ON businesses(takeout_orders_enabled) 
WHERE takeout_orders_enabled = TRUE;

