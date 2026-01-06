-- ============================================
-- INSERT TEST ORDER - READY TO RUN
-- ============================================
-- Business ID: e0f461e0-6774-4055-8699-8c6a3d404596
-- Menu Item: #1 Cheese Burger - $14.99
-- Menu Item ID: d6ba73d3-004b-4313-84d0-a97322409ce2

-- This will create an order with 1 Cheese Burger
WITH new_order AS (
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
    'e0f461e0-6774-4055-8699-8c6a3d404596',
    'Test Customer',
    '5198722736',
    'TO-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(
      CAST(
        COALESCE(
          (SELECT MAX(CAST(SUBSTRING(order_number FROM '\d+$') AS INTEGER))
           FROM takeout_orders
           WHERE business_id = 'e0f461e0-6774-4055-8699-8c6a3d404596'
             AND order_number LIKE 'TO-' || TO_CHAR(NOW(), 'YYYY') || '-%'
             AND deleted_at IS NULL),
          0
        ) + 1 AS TEXT
      ),
      3,
      '0'
    ),
    'pending',
    14.99,
    1.95,
    16.94,
    NOW() + INTERVAL '30 minutes'
  )
  RETURNING id, order_number
)
-- Add the Cheese Burger item
INSERT INTO takeout_order_items (
  order_id,
  item_name,
  item_description,
  quantity,
  unit_price,
  item_total
)
SELECT 
  new_order.id,
  'Cheese Burger',
  'Classic cheeseburger',
  1,
  14.99,
  14.99
FROM new_order
RETURNING order_id, item_name, quantity, item_total;

-- ============================================
-- VIEW THE ORDER YOU JUST CREATED
-- ============================================
-- Run this after inserting the order to see it:
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
  json_agg(
    json_build_object(
      'item_number', oi.item_number,
      'item_name', oi.item_name,
      'quantity', oi.quantity,
      'unit_price', oi.unit_price,
      'item_total', oi.item_total
    )
  ) as items
FROM takeout_orders o
LEFT JOIN takeout_order_items oi ON oi.order_id = o.id
WHERE o.business_id = 'e0f461e0-6774-4055-8699-8c6a3d404596'
  AND o.status = 'pending'
  AND o.deleted_at IS NULL
GROUP BY o.id, o.order_number, o.customer_name, o.customer_phone, 
         o.status, o.subtotal, o.tax, o.total, o.estimated_ready_time, o.created_at
ORDER BY o.created_at DESC
LIMIT 1;

