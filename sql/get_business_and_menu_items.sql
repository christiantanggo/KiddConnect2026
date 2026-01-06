-- ============================================
-- STEP 1: Get your Business ID
-- ============================================
-- Run this first to see all your businesses
SELECT 
  id,
  name,
  public_phone_number,
  takeout_orders_enabled
FROM businesses
WHERE deleted_at IS NULL
ORDER BY name;

-- ============================================
-- STEP 2: View Menu Items for Your Business
-- ============================================
-- Copy the id from Step 1 and paste it below (replace the UUID)
-- Example: If your business id is 'e0f461e0-6774-4055-8699-8c6a3d404596', use that

SELECT 
  id,
  item_number,
  name,
  description,
  category,
  price,
  is_available
FROM menu_items
WHERE business_id = 'e0f461e0-6774-4055-8699-8c6a3d404596'  -- REPLACE THIS with your business_id from Step 1
  AND is_active = TRUE
  AND deleted_at IS NULL
ORDER BY item_number;

-- ============================================
-- STEP 3: Insert a Test Order
-- ============================================
-- Replace 'e0f461e0-6774-4055-8699-8c6a3d404596' with your business_id from Step 1

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
  'e0f461e0-6774-4055-8699-8c6a3d404596',  -- REPLACE with your business_id
  'Test Customer',
  '5198722736',
  'TO-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(
    COALESCE(
      (SELECT MAX(CAST(SUBSTRING(order_number FROM '\d+$') AS INTEGER))
       FROM takeout_orders
       WHERE business_id = 'e0f461e0-6774-4055-8699-8c6a3d404596'  -- REPLACE with your business_id
         AND order_number LIKE 'TO-' || TO_CHAR(NOW(), 'YYYY') || '-%'
         AND deleted_at IS NULL),
      0
    ) + 1,
    3,
    '0'
  ),
  'pending',
  15.99,
  2.08,
  18.07,
  NOW() + INTERVAL '30 minutes'
)
RETURNING id, order_number;

-- ============================================
-- STEP 4: Add Items to the Order
-- ============================================
-- After running Step 3, you'll get an order_id. Use that here.
-- Also use menu_item_id from Step 2

-- Example: Add item #1
INSERT INTO takeout_order_items (
  order_id,
  menu_item_id,
  item_number,
  item_name,
  quantity,
  unit_price,
  item_total
) VALUES (
  'PASTE_ORDER_ID_HERE',  -- From Step 3 RETURNING clause
  'PASTE_MENU_ITEM_ID_HERE',  -- From Step 2
  1,  -- Item number
  'Cheeseburger',
  2,  -- Quantity
  7.99,
  15.98
);

