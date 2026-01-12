-- Add module_key to pricing_packages table to support multiple modules
-- For Review Reply AI, packages will be based on prompts instead of minutes
ALTER TABLE pricing_packages
ADD COLUMN IF NOT EXISTS module_key VARCHAR(50) DEFAULT 'phone-agent',
ADD COLUMN IF NOT EXISTS prompts_included INTEGER DEFAULT 0;

-- Add index for efficient module_key queries
CREATE INDEX IF NOT EXISTS idx_pricing_packages_module_key ON pricing_packages(module_key) 
WHERE deleted_at IS NULL;

-- Add comments
COMMENT ON COLUMN pricing_packages.module_key IS 'Module this package is for (e.g., "phone-agent", "reviews")';
COMMENT ON COLUMN pricing_packages.prompts_included IS 'Number of prompts included (for Review Reply AI modules)';

-- Update existing packages to have module_key = 'phone-agent' (they are all phone agent packages)
UPDATE pricing_packages
SET module_key = 'phone-agent'
WHERE module_key IS NULL OR module_key = '';

