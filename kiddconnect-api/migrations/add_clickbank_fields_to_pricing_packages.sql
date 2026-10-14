-- Add ClickBank fields to pricing_packages table
ALTER TABLE pricing_packages
ADD COLUMN IF NOT EXISTS is_clickbank_package BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS clickbank_commission_rate DECIMAL(5,2);

-- Add index for efficient ClickBank package queries
CREATE INDEX IF NOT EXISTS idx_pricing_packages_clickbank ON pricing_packages(is_clickbank_package, module_key) 
WHERE is_clickbank_package = TRUE AND deleted_at IS NULL;

-- Add comments
COMMENT ON COLUMN pricing_packages.is_clickbank_package IS 'Mark this package as the ClickBank affiliate package for this module';
COMMENT ON COLUMN pricing_packages.clickbank_commission_rate IS 'Commission rate percentage for ClickBank affiliates (e.g., 75.00 for 75%)';

