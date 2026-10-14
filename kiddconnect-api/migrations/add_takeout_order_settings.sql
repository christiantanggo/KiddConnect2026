-- Add tax and estimated ready time settings for takeout orders
-- These settings are per-business and control how takeout orders are processed

ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS takeout_tax_rate DECIMAL(5, 4) DEFAULT 0.13, -- Default 13% (Ontario HST)
ADD COLUMN IF NOT EXISTS takeout_tax_calculation_method VARCHAR(20) DEFAULT 'inclusive', -- 'inclusive' or 'exclusive'
ADD COLUMN IF NOT EXISTS takeout_estimated_ready_minutes INTEGER DEFAULT 30; -- Default 30 minutes

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_businesses_takeout_settings 
ON businesses(takeout_orders_enabled) 
WHERE takeout_orders_enabled = TRUE;

-- Add comment
COMMENT ON COLUMN businesses.takeout_tax_rate IS 'Tax rate for takeout orders (e.g., 0.13 for 13%)';
COMMENT ON COLUMN businesses.takeout_tax_calculation_method IS 'How tax is calculated: inclusive (tax included in price) or exclusive (tax added to price)';
COMMENT ON COLUMN businesses.takeout_estimated_ready_minutes IS 'Default estimated ready time in minutes for takeout orders';

