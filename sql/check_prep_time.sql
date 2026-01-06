-- ============================================
-- CHECK PREP TIME SETTINGS IN DATABASE
-- ============================================

-- Check prep time for all businesses
SELECT 
  id,
  name,
  takeout_orders_enabled,
  takeout_estimated_ready_minutes,
  takeout_tax_rate,
  takeout_tax_calculation_method
FROM businesses
WHERE deleted_at IS NULL
ORDER BY name;

-- Check prep time for your specific business
-- Replace 'YOUR_BUSINESS_ID' with your actual business_id
SELECT 
  id,
  name,
  takeout_orders_enabled,
  takeout_estimated_ready_minutes,
  takeout_tax_rate,
  takeout_tax_calculation_method
FROM businesses
WHERE id = 'e0f461e0-6774-4055-8699-8c6a3d404596'  -- Your business ID
  AND deleted_at IS NULL;

-- Check recent orders and their created_at vs estimated_ready_time
SELECT 
  id,
  order_number,
  customer_name,
  created_at,
  estimated_ready_time,
  status,
  -- Calculate the difference between created_at and estimated_ready_time
  EXTRACT(EPOCH FROM (estimated_ready_time - created_at)) / 60 as minutes_between_created_and_estimated
FROM takeout_orders
WHERE business_id = 'e0f461e0-6774-4055-8699-8c6a3d404596'  -- Your business ID
  AND deleted_at IS NULL
ORDER BY created_at DESC
LIMIT 5;

-- Check if estimated_ready_time is way off from created_at + 30 minutes
SELECT 
  id,
  order_number,
  created_at,
  estimated_ready_time,
  -- What it should be (created_at + 30 minutes)
  created_at + INTERVAL '30 minutes' as should_be_ready_time,
  -- What it actually is
  estimated_ready_time as actual_ready_time,
  -- Difference in minutes
  EXTRACT(EPOCH FROM (estimated_ready_time - created_at)) / 60 as actual_minutes,
  EXTRACT(EPOCH FROM ((created_at + INTERVAL '30 minutes') - created_at)) / 60 as expected_minutes
FROM takeout_orders
WHERE business_id = 'e0f461e0-6774-4055-8699-8c6a3d404596'
  AND deleted_at IS NULL
ORDER BY created_at DESC
LIMIT 5;

