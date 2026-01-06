-- Create menu_items table for restaurant menus
-- Menu items are numbered automatically for easier AI understanding (#1, #2, etc.)
-- This supports: AI phone ordering, SMS ordering, online ordering, and chatbot ordering

CREATE TABLE IF NOT EXISTS menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  
  -- Item identification
  item_number INTEGER NOT NULL, -- Auto-numbered per business (1, 2, 3, ...)
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100), -- e.g., "Appetizers", "Main Courses", "Desserts"
  
  -- Pricing
  price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  
  -- Availability and status
  is_available BOOLEAN DEFAULT TRUE,
  is_active BOOLEAN DEFAULT TRUE, -- Soft delete
  
  -- Display order (for sorting within category)
  display_order INTEGER DEFAULT 0,
  
  -- Images (for future online ordering)
  image_url TEXT,
  
  -- Metadata for future phases
  -- For order-out API integration
  external_id VARCHAR(255), -- ID in external ordering system
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb, -- Flexible storage for future needs
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_menu_items_business_id ON menu_items(business_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_business_item_number ON menu_items(business_id, item_number);
CREATE INDEX IF NOT EXISTS idx_menu_items_business_category ON menu_items(business_id, category) WHERE is_active = TRUE AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_menu_items_business_active ON menu_items(business_id, is_active, is_available) WHERE deleted_at IS NULL;

-- Create unique constraint: business_id + item_number should be unique (per business)
-- This ensures each business has unique item numbers
CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_items_unique_number_per_business 
ON menu_items(business_id, item_number) 
WHERE deleted_at IS NULL;

-- Add comment for documentation
COMMENT ON TABLE menu_items IS 'Menu items for restaurants. Items are automatically numbered per business (#1, #2, etc.) for easier AI understanding across phone, SMS, online, and chatbot ordering.';

-- Function to automatically assign next item number for a business
CREATE OR REPLACE FUNCTION get_next_menu_item_number(p_business_id UUID)
RETURNS INTEGER AS $$
DECLARE
  next_number INTEGER;
BEGIN
  SELECT COALESCE(MAX(item_number), 0) + 1
  INTO next_number
  FROM menu_items
  WHERE business_id = p_business_id
    AND deleted_at IS NULL;
  
  RETURN next_number;
END;
$$ LANGUAGE plpgsql;

