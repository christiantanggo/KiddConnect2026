-- Add global_modifier_ids array to menu_items table
-- This stores which global modifiers are applied to each menu item
-- Using JSONB for better Supabase/PostgREST compatibility

ALTER TABLE menu_items 
ADD COLUMN IF NOT EXISTS global_modifier_ids JSONB DEFAULT '[]'::jsonb;

-- Add index for performance (GIN index for JSONB array queries)
CREATE INDEX IF NOT EXISTS idx_menu_items_global_modifier_ids 
ON menu_items USING GIN (global_modifier_ids);

-- Add comment
COMMENT ON COLUMN menu_items.global_modifier_ids IS 'Array of global modifier IDs (as JSONB array) that apply to this menu item';

