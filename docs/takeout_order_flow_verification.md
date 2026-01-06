# Takeout Order Flow Verification

## Flow Overview
1. **AI Call** → Customer places order via phone
2. **VAPI Function Call** → AI calls `submit_takeout_order` function
3. **Webhook Handler** → `routes/vapi.js` receives function call
4. **Database Insert** → `TakeoutOrder.create()` inserts order
5. **Kiosk Display** → Kiosk polls `/api/kiosk/orders/active` and displays order

## Verification Checklist

### ✅ 1. VAPI Function Definition (`services/vapi.js`)
- [x] Function name: `submit_takeout_order`
- [x] Function type: `serverless`
- [x] Required parameters: `customer_phone`, `items`
- [x] Item properties: `name`, `quantity`, `price`, `item_number`, `modifications`
- [x] Optional: `customer_name`, `customer_email`, `subtotal`, `tax`, `total`, `special_instructions`

### ✅ 2. Webhook Handler (`routes/vapi.js`)
- [x] Handles `function-call` event type
- [x] Extracts `assistantId` to find business
- [x] Finds business via `Business.findByVapiAssistantId()`
- [x] Finds call session via `CallSession.findByVapiCallId()`
- [x] Parses function arguments (handles string or object)
- [x] Validates required fields (`customer_phone`, `items`)
- [x] Maps menu items by `item_number` if provided
- [x] Recalculates tax based on business settings
- [x] Calls `TakeoutOrder.create()` with correct data structure

### ✅ 3. Database Schema (`migrations/create_takeout_orders_tables.sql`)
**takeout_orders table:**
- [x] `business_id` (UUID, required)
- [x] `call_session_id` (UUID, nullable)
- [x] `vapi_call_id` (VARCHAR, nullable)
- [x] `customer_name` (VARCHAR, nullable)
- [x] `customer_phone` (VARCHAR, required)
- [x] `customer_email` (VARCHAR, nullable)
- [x] `order_number` (VARCHAR, auto-generated)
- [x] `order_type` (VARCHAR, default 'takeout')
- [x] `status` (VARCHAR, default 'pending')
- [x] `special_instructions` (TEXT, nullable)
- [x] `subtotal`, `tax`, `total` (DECIMAL, required)
- [x] `estimated_ready_time` (TIMESTAMP, nullable)
- [x] `created_at`, `updated_at`, `deleted_at` (timestamps)

**takeout_order_items table:**
- [x] `order_id` (UUID, required, FK)
- [x] `menu_item_id` (UUID, nullable, FK)
- [x] `item_number` (INTEGER, nullable)
- [x] `item_name` (VARCHAR, required)
- [x] `item_description` (TEXT, nullable)
- [x] `quantity` (INTEGER, required)
- [x] `unit_price` (DECIMAL, required)
- [x] `item_total` (DECIMAL, required)
- [x] `modifications` (TEXT, nullable)
- [x] `special_instructions` (TEXT, nullable)

### ✅ 4. TakeoutOrder Model (`models/TakeoutOrder.js`)
- [x] `create()` method accepts all required fields
- [x] Generates order number automatically
- [x] Inserts order into `takeout_orders` table
- [x] Inserts items into `takeout_order_items` table
- [x] Maps item fields correctly:
  - `menu_item_id` from processed item
  - `item_number` from processed item
  - `item_name` from `name` or `item_name`
  - `item_description` from `description` or `item_description`
  - `quantity`, `unit_price`, `item_total`
  - `modifications` as TEXT
- [x] `getActiveOrders()` fetches orders with status: `pending`, `confirmed`, `preparing`
- [x] `getActiveOrders()` includes items for each order
- [x] `findById()` fetches order with items

### ✅ 5. Kiosk API (`routes/kiosk.js`)
- [x] `/api/kiosk/orders/active` endpoint exists
- [x] Uses `authenticateKiosk` middleware
- [x] Calls `TakeoutOrder.getActiveOrders(businessId)`
- [x] Returns orders with items array
- [x] `/api/kiosk/settings` includes `timezone` for date formatting

### ✅ 6. Data Mapping Verification

**VAPI Function → Handler:**
- `customer_name` → `customer_name` ✅
- `customer_phone` → `customer_phone` ✅
- `customer_email` → `customer_email` ✅
- `items[]` → processed and mapped ✅
- `subtotal` → recalculated if needed ✅
- `tax` → recalculated based on business settings ✅
- `total` → recalculated ✅
- `special_instructions` → `special_instructions` ✅

**Handler → Database:**
- `business_id` → from `Business.findByVapiAssistantId()` ✅
- `call_session_id` → from `CallSession.findByVapiCallId()` ✅
- `vapi_call_id` → from event ✅
- `items[]` → mapped to `takeout_order_items` ✅
  - `item.name` → `item_name` ✅
  - `item.item_number` → `item_number` ✅
  - `item.quantity` → `quantity` ✅
  - `item.price` → `unit_price` ✅
  - `item.modifications` → `modifications` (TEXT) ✅

**Database → Kiosk:**
- All order fields included ✅
- Items array attached to each order ✅
- Status filtering: only `pending`, `confirmed`, `preparing` ✅
- Ordered by `created_at` ascending (oldest first) ✅

## Potential Issues to Check

### ⚠️ Issue 1: Menu Item Matching
- Handler tries to match items by `item_number` using `MenuItem.findByBusinessIdAndNumber()`
- If menu item not found, falls back to item data as provided
- **Action**: Verify `MenuItem.findByBusinessIdAndNumber()` exists and works

### ⚠️ Issue 2: Modifier Price Calculation
- Handler notes: "Modifier prices are included in the AI's calculation"
- Modifications stored as TEXT, not parsed for prices
- **Action**: Verify AI includes modifier prices in item prices or subtotal

### ⚠️ Issue 3: Tax Calculation
- Handler recalculates tax based on business settings
- Uses `takeout_tax_rate` and `takeout_tax_calculation_method`
- **Action**: Verify business has these fields set correctly

### ⚠️ Issue 4: Order Number Generation
- Uses `generateOrderNumber()` which queries for max order number
- Format: `TO-YYYY-XXX` (e.g., TO-2026-001)
- **Action**: Verify this works correctly with concurrent orders

## Testing Checklist

1. **Test AI Order Submission:**
   - [ ] Place test call
   - [ ] AI collects order information
   - [ ] AI calls `submit_takeout_order` function
   - [ ] Check webhook logs for function call
   - [ ] Verify order appears in database

2. **Test Database Insert:**
   - [ ] Verify order in `takeout_orders` table
   - [ ] Verify items in `takeout_order_items` table
   - [ ] Check all fields are populated correctly
   - [ ] Verify `menu_item_id` is set if item_number matches

3. **Test Kiosk Display:**
   - [ ] Open kiosk with valid token
   - [ ] Verify order appears in active orders
   - [ ] Check all item details display correctly
   - [ ] Verify modifications show up
   - [ ] Check countdown timer works
   - [ ] Verify timezone formatting

4. **Test Order Updates:**
   - [ ] Update order status from kiosk
   - [ ] Verify status change persists
   - [ ] Check flash notification stops after status change

## Files to Verify

- ✅ `services/vapi.js` - Function definition
- ✅ `routes/vapi.js` - Webhook handler
- ✅ `models/TakeoutOrder.js` - Database model
- ✅ `routes/kiosk.js` - Kiosk API
- ✅ `migrations/create_takeout_orders_tables.sql` - Database schema
- ✅ `frontend/app/kiosk/page.jsx` - Kiosk UI

