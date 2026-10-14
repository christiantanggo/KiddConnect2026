-- Add modifiers field to menu_items table
-- Modifiers allow businesses to define what modifications are available for each item
-- This prevents customers from requesting items the restaurant doesn't have

ALTER TABLE menu_items 
ADD COLUMN IF NOT EXISTS modifiers JSONB DEFAULT '{"free": [], "paid": []}'::jsonb;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_menu_items_modifiers 
ON menu_items USING GIN (modifiers);

-- Add comment
COMMENT ON COLUMN menu_items.modifiers IS 'JSONB object with "free" and "paid" arrays. Each modifier has: name, description (optional), price (for paid only). Example: {"free": [{"name": "No onions"}, {"name": "Extra pickles"}], "paid": [{"name": "Extra cheese", "price": 1.50}, {"name": "Bacon", "price": 2.00}]}';

