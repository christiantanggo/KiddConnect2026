-- Create global_modifiers table
-- Global modifiers can be reused across multiple menu items to speed up menu creation

CREATE TABLE IF NOT EXISTS global_modifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  
  -- Modifier details
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) DEFAULT 0, -- 0 for free modifiers, > 0 for paid
  is_free BOOLEAN DEFAULT TRUE, -- True if free, false if paid
  
  -- Category/grouping (optional)
  category VARCHAR(100), -- e.g., "Toppings", "Sauces", "Sides"
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Display order
  display_order INTEGER DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_global_modifiers_business_id 
ON global_modifiers(business_id) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_global_modifiers_active 
ON global_modifiers(business_id, is_active) 
WHERE deleted_at IS NULL AND is_active = TRUE;

-- Add comment
COMMENT ON TABLE global_modifiers IS 'Global modifiers that can be reused across multiple menu items';
COMMENT ON COLUMN global_modifiers.is_free IS 'True if modifier is free, false if it has a price';
COMMENT ON COLUMN global_modifiers.price IS 'Price for paid modifiers (0 for free modifiers)';

