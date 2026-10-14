-- Add sale_price and sale_duration_months to pricing_packages
-- sale_price: The discounted price during the sale (separate from monthly_price)
-- sale_duration_months: How long customers keep the sale price (NULL = indefinitely)

ALTER TABLE pricing_packages
ADD COLUMN IF NOT EXISTS sale_price DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS sale_duration_months INTEGER;

-- Make sale_end_date optional (sales can now be quantity-based only)
-- Note: sale_end_date can remain NULL for quantity-only sales

-- Add comment
COMMENT ON COLUMN pricing_packages.sale_price IS 'Discounted price during sale (if NULL, uses monthly_price)';
COMMENT ON COLUMN pricing_packages.sale_duration_months IS 'How long customers keep sale price in months (NULL = indefinitely)';

-- Add tracking fields to businesses table for sale purchases
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS purchased_at_sale_price DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS sale_price_expires_at DATE,
ADD COLUMN IF NOT EXISTS sale_name VARCHAR(255);

-- Add index for checking expired sale prices
CREATE INDEX IF NOT EXISTS idx_businesses_sale_price_expires_at ON businesses(sale_price_expires_at) 
WHERE sale_price_expires_at IS NOT NULL;

COMMENT ON COLUMN businesses.purchased_at_sale_price IS 'Price the customer purchased at during sale';
COMMENT ON COLUMN businesses.sale_price_expires_at IS 'Date when sale price expires (NULL = never expires)';
COMMENT ON COLUMN businesses.sale_name IS 'Name of the sale when customer purchased';

