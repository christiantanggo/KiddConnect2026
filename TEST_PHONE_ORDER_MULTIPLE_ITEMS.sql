-- Test SQL: Verify that when an order is placed by a caller with the AI,
-- multiple items will appear in the kiosk for the restaurant
--
-- This script:
-- 1. Gets or creates a test restaurant business
-- 2. Creates menu items if they don't exist
-- 3. Simulates a phone call (call_session)
-- 4. Creates an order with multiple items
-- 5. Verifies the order and items appear correctly

-- ============================================================================
-- STEP 1: Get or create a test business (restaurant)
-- ============================================================================
-- Replace 'YOUR_BUSINESS_ID' with an actual business ID, or use this to find one:
DO $$
DECLARE
  v_business_id UUID;
  v_call_session_id UUID;
  v_order_id UUID;
  v_item_count INTEGER;
BEGIN
  -- Find an existing restaurant business (or use a specific ID)
  SELECT id INTO v_business_id 
  FROM businesses 
  WHERE deleted_at IS NULL 
  LIMIT 1;
  
  -- If no business exists, create one for testing
  IF v_business_id IS NULL THEN
    INSERT INTO businesses (name, email, phone)
    VALUES ('Test Restaurant', 'test@restaurant.com', '+1234567890')
    RETURNING id INTO v_business_id;
    
    RAISE NOTICE 'Created test business: %', v_business_id;
  ELSE
    RAISE NOTICE 'Using existing business: %', v_business_id;
  END IF;

-- ============================================================================
-- STEP 2: Create menu items if they don't exist
-- ============================================================================
  -- Create menu items for testing (if they don't already exist)
  INSERT INTO menu_items (business_id, item_number, name, description, category, price, is_available)
  SELECT v_business_id, 1, 'Cheeseburger', 'Classic cheeseburger with lettuce, tomato, and special sauce', 'Main Courses', 12.99, TRUE
  WHERE NOT EXISTS (
    SELECT 1 FROM menu_items WHERE business_id = v_business_id AND item_number = 1 AND deleted_at IS NULL
  );

  INSERT INTO menu_items (business_id, item_number, name, description, category, price, is_available)
  SELECT v_business_id, 2, 'French Fries', 'Crispy golden fries', 'Sides', 4.99, TRUE
  WHERE NOT EXISTS (
    SELECT 1 FROM menu_items WHERE business_id = v_business_id AND item_number = 2 AND deleted_at IS NULL
  );

  INSERT INTO menu_items (business_id, item_number, name, description, category, price, is_available)
  SELECT v_business_id, 3, 'Caesar Salad', 'Fresh romaine lettuce with Caesar dressing', 'Salads', 9.99, TRUE
  WHERE NOT EXISTS (
    SELECT 1 FROM menu_items WHERE business_id = v_business_id AND item_number = 3 AND deleted_at IS NULL
  );

  INSERT INTO menu_items (business_id, item_number, name, description, category, price, is_available)
  SELECT v_business_id, 4, 'Chocolate Milkshake', 'Rich chocolate milkshake', 'Beverages', 5.99, TRUE
  WHERE NOT EXISTS (
    SELECT 1 FROM menu_items WHERE business_id = v_business_id AND item_number = 4 AND deleted_at IS NULL
  );

  RAISE NOTICE 'Menu items ready';

-- ============================================================================
-- STEP 3: Create a call_session (simulating a phone call)
-- ============================================================================
  INSERT INTO call_sessions (
    business_id,
    vapi_call_id,
    caller_number,
    caller_name,
    status,
    started_at
  )
  VALUES (
    v_business_id,
    'TEST-CALL-' || gen_random_uuid()::text,
    '+15551234567',
    'John Doe',
    'completed',
    NOW()
  )
  RETURNING id INTO v_call_session_id;

  RAISE NOTICE 'Created call session: %', v_call_session_id;

-- ============================================================================
-- STEP 4: Create an order with MULTIPLE items
-- ============================================================================
  -- Generate order number (simple format: TO-YYYYMMDD-HHMMSS)
  INSERT INTO takeout_orders (
    business_id,
    call_session_id,
    vapi_call_id,
    customer_name,
    customer_phone,
    order_number,
    order_type,
    status,
    special_instructions,
    subtotal,
    tax,
    total,
    created_at
  )
  VALUES (
    v_business_id,
    v_call_session_id,
    'TEST-CALL-' || v_call_session_id::text,
    'John Doe',
    '+15551234567',
    'TO-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS'),
    'takeout',
    'pending',
    'Please have order ready in 30 minutes',
    35.96,  -- subtotal (will calculate from items)
    2.88,   -- tax (8%)
    38.84,  -- total
    NOW()
  )
  RETURNING id INTO v_order_id;

  RAISE NOTICE 'Created order: %', v_order_id;

-- ============================================================================
-- STEP 5: Add MULTIPLE items to the order
-- ============================================================================
  -- Item 1: Cheeseburger (quantity 2)
  INSERT INTO takeout_order_items (
    order_id,
    menu_item_id,
    item_number,
    item_name,
    item_description,
    quantity,
    unit_price,
    item_total,
    modifications
  )
  SELECT 
    v_order_id,
    id,
    item_number,
    name,
    description,
    2,  -- quantity
    price,
    price * 2,  -- item_total
    'No pickles, extra cheese'::text
  FROM menu_items
  WHERE business_id = v_business_id AND item_number = 1 AND deleted_at IS NULL
  LIMIT 1;

  -- Item 2: French Fries (quantity 1)
  INSERT INTO takeout_order_items (
    order_id,
    menu_item_id,
    item_number,
    item_name,
    item_description,
    quantity,
    unit_price,
    item_total,
    modifications
  )
  SELECT 
    v_order_id,
    id,
    item_number,
    name,
    description,
    1,  -- quantity
    price,
    price,  -- item_total
    'Well done'::text
  FROM menu_items
  WHERE business_id = v_business_id AND item_number = 2 AND deleted_at IS NULL
  LIMIT 1;

  -- Item 3: Caesar Salad (quantity 1)
  INSERT INTO takeout_order_items (
    order_id,
    menu_item_id,
    item_number,
    item_name,
    item_description,
    quantity,
    unit_price,
    item_total
  )
  SELECT 
    v_order_id,
    id,
    item_number,
    name,
    description,
    1,  -- quantity
    price,
    price  -- item_total
  FROM menu_items
  WHERE business_id = v_business_id AND item_number = 3 AND deleted_at IS NULL
  LIMIT 1;

  -- Item 4: Chocolate Milkshake (quantity 1)
  INSERT INTO takeout_order_items (
    order_id,
    menu_item_id,
    item_number,
    item_name,
    item_description,
    quantity,
    unit_price,
    item_total
  )
  SELECT 
    v_order_id,
    id,
    item_number,
    name,
    description,
    1,  -- quantity
    price,
    price  -- item_total
  FROM menu_items
  WHERE business_id = v_business_id AND item_number = 4 AND deleted_at IS NULL
  LIMIT 1;

  -- Count items in order
  SELECT COUNT(*) INTO v_item_count
  FROM takeout_order_items
  WHERE order_id = v_order_id;

  RAISE NOTICE 'Added % items to order', v_item_count;

-- ============================================================================
-- STEP 6: Verify the order and items (View Results)
-- ============================================================================
  RAISE NOTICE '========================================';
  RAISE NOTICE 'TEST RESULTS:';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Business ID: %', v_business_id;
  RAISE NOTICE 'Call Session ID: %', v_call_session_id;
  RAISE NOTICE 'Order ID: %', v_order_id;
  RAISE NOTICE 'Total Items in Order: %', v_item_count;
  RAISE NOTICE '========================================';

END $$;

-- ============================================================================
-- VIEW THE RESULTS: Query to see the order and all items in kiosk format
-- ============================================================================
-- Run this query to see what appears in the kiosk:
SELECT 
  o.id AS order_id,
  o.order_number,
  o.customer_name,
  o.customer_phone,
  o.status,
  o.total,
  o.created_at AS order_time,
  o.special_instructions,
  oi.item_number,
  oi.item_name,
  oi.quantity,
  oi.unit_price,
  oi.item_total,
  oi.modifications,
  oi.special_instructions AS item_instructions
FROM takeout_orders o
LEFT JOIN takeout_order_items oi ON o.id = oi.order_id
WHERE o.status = 'pending'
  AND o.deleted_at IS NULL
ORDER BY o.created_at DESC, oi.item_number
LIMIT 20;

-- ============================================================================
-- VERIFICATION QUERY: Count items per order (should show multiple items)
-- ============================================================================
-- This should show orders with multiple items:
SELECT 
  o.order_number,
  o.customer_name,
  o.status,
  COUNT(oi.id) AS item_count,
  SUM(oi.item_total) AS calculated_total
FROM takeout_orders o
LEFT JOIN takeout_order_items oi ON o.id = oi.order_id
WHERE o.deleted_at IS NULL
GROUP BY o.id, o.order_number, o.customer_name, o.status
HAVING COUNT(oi.id) > 1  -- Only show orders with multiple items
ORDER BY o.created_at DESC
LIMIT 10;

-- ============================================================================
-- CLEANUP (Optional): Remove test data
-- ============================================================================
-- Uncomment to clean up test data:
/*
DELETE FROM takeout_order_items WHERE order_id IN (
  SELECT id FROM takeout_orders WHERE order_number LIKE 'TO-%TEST%'
);
DELETE FROM takeout_orders WHERE order_number LIKE 'TO-%TEST%';
DELETE FROM call_sessions WHERE vapi_call_id LIKE 'TEST-CALL-%';
*/

