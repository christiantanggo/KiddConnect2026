-- Add ClickBank integration fields to businesses table
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS clickbank_receipt VARCHAR(255),
ADD COLUMN IF NOT EXISTS clickbank_sale_id VARCHAR(255);

-- Add indexes for ClickBank lookups
CREATE INDEX IF NOT EXISTS idx_businesses_clickbank_receipt ON businesses(clickbank_receipt) WHERE clickbank_receipt IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_businesses_clickbank_sale_id ON businesses(clickbank_sale_id) WHERE clickbank_sale_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN businesses.clickbank_receipt IS 'ClickBank receipt number for order tracking';
COMMENT ON COLUMN businesses.clickbank_sale_id IS 'ClickBank sale ID for order tracking';

