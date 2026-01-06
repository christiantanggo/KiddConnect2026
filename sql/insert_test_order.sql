-- ============================================
-- INSERT TEST ORDER WITH YOUR MENU ITEM
-- ============================================
-- This uses your actual menu item:
-- Item #1: Cheese Burger - $14.99
-- Menu Item ID: d6ba73d3-004b-4313-84d0-a97322409ce2

-- STEP 1: Get your business_id (you'll need this)
-- Run this first:
SELECT 
  id,
  name
FROM businesses
WHERE deleted_at IS NULL;

-- STEP 2: Insert the order
-- Replace 'YOUR_BUSINESS_ID' with the id from Step 1
INSERT INTO takeout_orders (
  business_id,
  customer_name,
  customer_phone,
  order_number,
  status,
  subtotal,
  tax,
  total,
  estimated_ready_time
) VALUES (
  'YOUR_BUSINESS_ID',  -- Replace with your business_id from Step 1
  'Test Customer',
  '5198722736',
  'TO-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(
    COALESCE(
      (SELECT MAX(CAST(SUBSTRING(order_number FROM '\d+$') AS INTEGER))
       FROM takeout_orders
       WHERE business_id = 'YOUR_BUSINESS_ID'  -- Replace with your business_id
         AND order_number LIKE 'TO-' || TO_CHAR(NOW(), 'YYYY') || '-%'
         AND deleted_at IS NULL),
      0
    ) + 1,
    3,
    '0'
  ),
  'pending',
  14.99,  -- Price for 1 Cheese Burger
  1.95,   -- Tax (13% of 14.99 = 1.95)
  16.94,  -- Total
  NOW() + INTERVAL '30 minutes'
)
RETURNING id, order_number;

-- STEP 3: Add the Cheese Burger to the order
-- Replace 'ORDER_ID_FROM_STEP_2' with the id returned from Step 2
INSERT INTO takeout_order_items (
  order_id,
  menu_item_id,
  item_number,
  item_name,
  quantity,
  unit_price,
  item_total
) VALUES (
  'ORDER_ID_FROM_STEP_2',  -- Replace with order id from Step 2
  'd6ba73d3-004b-4313-84d0-a97322409ce2',  -- Your Cheese Burger menu item id
  1,  -- Item number
  'Cheese Burger',
  1,  -- Quantity
  14.99,
  14.99
);

-- ============================================
-- ALTERNATIVE: Insert order with 2 Cheese Burgers
-- ============================================
-- If you want to test with 2 burgers, use this instead:

-- Order with 2 items:
INSERT INTO takeout_orders (
  business_id,
  customer_name,
  customer_phone,
  order_number,
  status,
  subtotal,
  tax,
  total,
  estimated_ready_time
) VALUES (
  'YOUR_BUSINESS_ID',  -- Replace with your business_id
  'Test Customer',
  '5198722736',
  'TO-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(
    COALESCE(
      (SELECT MAX(CAST(SUBSTRING(order_number FROM '\d+$') AS INTEGER))
       FROM takeout_orders
       WHERE business_id = 'YOUR_BUSINESS_ID'
         AND order_number LIKE 'TO-' || TO_CHAR(NOW(), 'YYYY') || '-%'
         AND deleted_at IS NULL),
      0
    ) + 1,
    3,
    '0'
  ),
  'pending',
  29.98,  -- 2 x $14.99
  3.90,   -- Tax (13% of 29.98)
  33.88,  -- Total
  NOW() + INTERVAL '30 minutes'
)
RETURNING id, order_number;

-- Then add 2 burgers:
INSERT INTO takeout_order_items (
  order_id,
  menu_item_id,
  item_number,
  item_name,
  quantity,
  unit_price,
  item_total
) VALUES (
  'ORDER_ID_FROM_ABOVE',
  'd6ba73d3-004b-4313-84d0-a97322409ce2',
  1,
  'Cheese Burger',
  2,  -- Quantity: 2
  14.99,
  29.98
);

