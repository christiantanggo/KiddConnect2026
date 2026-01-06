-- Check what columns actually exist in takeout_order_items table
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'takeout_order_items'
ORDER BY ordinal_position;

