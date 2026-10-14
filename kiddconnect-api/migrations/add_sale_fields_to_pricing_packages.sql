-- Add sale/promotion fields to pricing_packages table
ALTER TABLE pricing_packages
ADD COLUMN IF NOT EXISTS sale_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS sale_start_date DATE,
ADD COLUMN IF NOT EXISTS sale_end_date DATE,
ADD COLUMN IF NOT EXISTS sale_max_quantity INTEGER,
ADD COLUMN IF NOT EXISTS sale_sold_count INTEGER DEFAULT 0;

-- Add index for efficient sale queries
CREATE INDEX IF NOT EXISTS idx_pricing_packages_sale_dates ON pricing_packages(sale_start_date, sale_end_date) 
WHERE sale_start_date IS NOT NULL AND sale_end_date IS NOT NULL;

-- Add comment
COMMENT ON COLUMN pricing_packages.sale_name IS 'Name of the sale/promotion (e.g., "Black Friday Sale", "Early Bird Special")';
COMMENT ON COLUMN pricing_packages.sale_start_date IS 'Date when the sale starts';
COMMENT ON COLUMN pricing_packages.sale_end_date IS 'Date when the sale ends';
COMMENT ON COLUMN pricing_packages.sale_max_quantity IS 'Maximum number of plans to sell during this sale (NULL = unlimited)';
COMMENT ON COLUMN pricing_packages.sale_sold_count IS 'Number of plans already sold during this sale';

