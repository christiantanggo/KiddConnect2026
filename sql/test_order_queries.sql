-- ============================================
-- SQL QUERIES FOR TESTING ORDERS
-- ============================================

-- 1. VIEW ALL BUSINESSES (to get business_id)
-- ============================================
SELECT 
  id,
  name,
  public_phone_number,
  takeout_orders_enabled
FROM businesses
WHERE deleted_at IS NULL
ORDER BY name;

-- 2. VIEW MENU ITEMS FOR A SPECIFIC BUSINESS
-- ============================================
-- Replace 'YOUR_BUSINESS_ID_HERE' with the actual business_id from step 1
SELECT 
  id,
  item_number,
  name,
  description,
  category,
  price,
  is_available,
  modifiers,
  global_modifier_ids
FROM menu_items
WHERE business_id = 'YOUR_BUSINESS_ID_HERE'
  AND is_active = TRUE
  AND deleted_at IS NULL
ORDER BY category, item_number;

-- 3. VIEW MENU ITEMS WITH DETAILED INFO (including modifiers)
-- ============================================
SELECT 
  mi.id,
  mi.item_number,
  mi.name,
  mi.description,
  mi.category,
  mi.price,
  mi.is_available,
  mi.modifiers,
  mi.global_modifier_ids,
  -- Count of global modifiers
  (
    SELECT COUNT(*)
    FROM global_modifiers gm
    WHERE gm.id::text = ANY(
      SELECT jsonb_array_elements_text(mi.global_modifier_ids)
    )
    AND gm.deleted_at IS NULL
    AND gm.is_active = TRUE
  ) as global_modifier_count
FROM menu_items mi
WHERE mi.business_id = 'YOUR_BUSINESS_ID_HERE'
  AND mi.is_active = TRUE
  AND mi.deleted_at IS NULL
ORDER BY mi.category, mi.item_number;

-- 4. GET NEXT ORDER NUMBER FOR A BUSINESS
-- ============================================
-- This generates the next order number (e.g., TO-2026-001)
SELECT 
  'TO-' || TO_CHAR(NOW(), 'YYYY') || '-' || 
  LPAD(
    COALESCE(
      (SELECT MAX(CAST(SUBSTRING(order_number FROM '\d+$') AS INTEGER))
       FROM takeout_orders
       WHERE business_id = 'YOUR_BUSINESS_ID_HERE'
         AND order_number LIKE 'TO-' || TO_CHAR(NOW(), 'YYYY') || '-%'
         AND deleted_at IS NULL),
      0
    ) + 1,
    3,
    '0'
  ) as next_order_number;

-- 5. INSERT A NEW ORDER
-- ============================================
-- Replace the values below with actual data:
-- - YOUR_BUSINESS_ID_HERE: Get from step 1
-- - YOUR_MENU_ITEM_ID_HERE: Get from step 2
-- - Adjust customer info, prices, etc.

-- First, get the next order number (you can use the query from step 4)
-- For this example, let's use: TO-2026-001

-- Insert the order
INSERT INTO takeout_orders (
  business_id,
  customer_name,
  customer_phone,
  customer_email,
  order_number,
  order_type,
  status,
  special_instructions,
  subtotal,
  tax,
  total,
  estimated_ready_time
) VALUES (
  'YOUR_BUSINESS_ID_HERE',  -- Replace with actual business_id
  'John Doe',                -- Customer name
  '5198722736',              -- Customer phone
  'john.doe@example.com',    -- Customer email (optional)
  'TO-2026-001',             -- Order number (use query from step 4)
  'takeout',                 -- Order type
  'pending',                 -- Status: 'pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'
  'Please have ready by 6 PM', -- Special instructions
  15.99,                     -- Subtotal
  2.08,                      -- Tax (13% of 15.99 = 2.08)
  18.07,                     -- Total
  NOW() + INTERVAL '30 minutes' -- Estimated ready time (30 minutes from now)
)
RETURNING id, order_number;

-- 6. INSERT ORDER ITEMS (after creating the order)
-- ============================================
-- Replace ORDER_ID_HERE with the id returned from step 5
-- Replace MENU_ITEM_ID_HERE with the menu item id from step 2

-- Example: Add item #1 (Cheeseburger) with quantity 2
INSERT INTO takeout_order_items (
  order_id,
  menu_item_id,
  item_number,
  item_name,
  item_description,
  quantity,
  unit_price,
  item_total,
  modifications,
  special_instructions
) VALUES (
  'ORDER_ID_HERE',           -- Replace with order id from step 5
  'MENU_ITEM_ID_HERE',       -- Replace with menu item id from step 2
  1,                         -- Item number (e.g., #1)
  'Cheeseburger',            -- Item name
  'Classic cheeseburger with lettuce, tomato, and special sauce', -- Description
  2,                         -- Quantity
  7.99,                      -- Unit price
  15.98,                     -- Item total (quantity * unit_price)
  'No onions, extra cheese', -- Modifications
  NULL                       -- Special instructions for this item
);

-- Example: Add another item (Fries)
INSERT INTO takeout_order_items (
  order_id,
  menu_item_id,
  item_number,
  item_name,
  item_description,
  quantity,
  unit_price,
  item_total,
  modifications,
  special_instructions
) VALUES (
  'ORDER_ID_HERE',           -- Same order id
  'ANOTHER_MENU_ITEM_ID',    -- Different menu item id
  2,                         -- Item number (e.g., #2)
  'French Fries',            -- Item name
  'Crispy golden fries',      -- Description
  1,                         -- Quantity
  3.99,                      -- Unit price
  3.99,                      -- Item total
  NULL,                      -- No modifications
  NULL                       -- No special instructions
);

-- 7. VIEW THE CREATED ORDER
-- ============================================
SELECT 
  o.id,
  o.order_number,
  o.customer_name,
  o.customer_phone,
  o.status,
  o.subtotal,
  o.tax,
  o.total,
  o.estimated_ready_time,
  o.created_at,
  -- Order items
  json_agg(
    json_build_object(
      'id', oi.id,
      'item_number', oi.item_number,
      'item_name', oi.item_name,
      'quantity', oi.quantity,
      'unit_price', oi.unit_price,
      'item_total', oi.item_total,
      'modifications', oi.modifications
    )
  ) as items
FROM takeout_orders o
LEFT JOIN takeout_order_items oi ON oi.order_id = o.id
WHERE o.id = 'ORDER_ID_HERE'  -- Replace with order id
GROUP BY o.id, o.order_number, o.customer_name, o.customer_phone, 
         o.status, o.subtotal, o.tax, o.total, o.estimated_ready_time, o.created_at;

-- 8. VIEW ALL ACTIVE ORDERS FOR A BUSINESS
-- ============================================
SELECT 
  o.id,
  o.order_number,
  o.customer_name,
  o.customer_phone,
  o.status,
  o.subtotal,
  o.tax,
  o.total,
  o.estimated_ready_time,
  o.created_at,
  COUNT(oi.id) as item_count
FROM takeout_orders o
LEFT JOIN takeout_order_items oi ON oi.order_id = o.id
WHERE o.business_id = 'YOUR_BUSINESS_ID_HERE'
  AND o.status NOT IN ('completed', 'cancelled')
  AND o.deleted_at IS NULL
GROUP BY o.id, o.order_number, o.customer_name, o.customer_phone, 
         o.status, o.subtotal, o.tax, o.total, o.estimated_ready_time, o.created_at
ORDER BY o.created_at DESC;

-- ============================================
-- QUICK TEST: Complete order insertion example
-- ============================================
-- This is a complete example that you can modify:

-- Step 1: Get your business_id (run query #1 above)
-- Step 2: Get menu item IDs (run query #2 above)
-- Step 3: Insert order (modify query #5 with your data)
-- Step 4: Insert order items (modify query #6 with your order_id and menu_item_ids)
-- Step 5: View your order (run query #7 with your order_id)

