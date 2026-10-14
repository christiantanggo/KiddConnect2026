-- Add shock score columns to orbix_raw_items
-- Shock scores are now calculated immediately after scraping (Step 1)
ALTER TABLE orbix_raw_items
ADD COLUMN IF NOT EXISTS category VARCHAR(50),
ADD COLUMN IF NOT EXISTS shock_score INTEGER CHECK (shock_score >= 0 AND shock_score <= 100),
ADD COLUMN IF NOT EXISTS factors_json JSONB;

-- Add index for shock_score to enable efficient sorting
CREATE INDEX IF NOT EXISTS idx_orbix_raw_items_shock_score ON orbix_raw_items(shock_score) WHERE shock_score IS NOT NULL;

-- Add index for category
CREATE INDEX IF NOT EXISTS idx_orbix_raw_items_category ON orbix_raw_items(category) WHERE category IS NOT NULL;




