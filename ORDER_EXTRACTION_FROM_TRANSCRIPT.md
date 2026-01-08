# Order Extraction from VAPI Transcript

## Problem
VAPI functions/tools are not working when rebuilding the agent, so we cannot use the `submit_takeout_order` function to capture orders directly. We need an alternative way to capture orders from phone calls and store them in Supabase so they appear in the kiosk.

## Solution
Instead of relying on VAPI functions, we now **extract order information from the call transcript and summary** when the call ends. This approach:

1. ✅ Works without VAPI functions
2. ✅ Captures orders from natural conversation
3. ✅ Automatically creates orders in the database
4. ✅ Orders appear in the kiosk immediately

## How It Works

### 1. Call End Processing
When a VAPI call ends, the webhook handler (`handleCallEnd` in `routes/vapi.js`) receives:
- Call transcript (full conversation)
- Call summary (AI-generated summary)
- Call metadata

### 2. Order Detection
The system checks if the call was about placing an order by looking for keywords:
- "order", "takeout", "delivery", "pickup"
- "placed an order", "want to order", "would like to order"

### 3. Order Extraction
If order keywords are detected, the `extractOrderFromTranscript()` function parses:

**Customer Information:**
- Name (from "my name is..." patterns)
- Phone number (from call session or transcript)
- Email (if mentioned)

**Order Items:**
- Item names with quantities (e.g., "2 pizzas", "1 burger")
- Menu item numbers (e.g., "item #5", "number 5")
- Prices (if mentioned in conversation)
- Special instructions/modifications

**Totals:**
- Subtotal, tax, and total (if mentioned)
- Or calculated from items if not mentioned

### 4. Menu Item Lookup
If menu item numbers are found (e.g., "item #5"), the system:
1. Looks up the item in the `menu_items` table
2. Uses the menu item's name, description, and price
3. Links the order item to the menu item

### 5. Order Creation
The extracted order data is used to create a `TakeoutOrder` in Supabase:
- Order is created with status `pending`
- Items are stored in `takeout_order_items` table
- Order appears in kiosk immediately

## Example Flow

**Customer Call:**
> "Hi, I'd like to place an order. My name is John. I want 2 pizzas, item number 5, and 3 fries. My phone is 555-1234."

**AI Response:**
> "Great! I have your order: 2 pizzas, item #5, and 3 fries. Your total is $45.50. Is that correct?"

**What Happens:**
1. Call ends, webhook receives transcript
2. System detects "order" keyword
3. Extracts:
   - Customer: John, 555-1234
   - Items: 2x pizza, 1x item #5, 3x fries
   - Total: $45.50
4. Looks up item #5 from menu
5. Creates order in database
6. Order appears in kiosk at `/api/kiosk/orders/active`

## Code Location

The order extraction logic is in:
- **Function**: `extractOrderFromTranscript()` in `routes/vapi.js` (line ~1680)
- **Integration**: Called in `handleCallEnd()` function (line ~1230)
- **Model**: Uses `TakeoutOrder.create()` from `models/TakeoutOrder.js`

## Limitations & Notes

1. **Accuracy**: Extraction relies on natural language patterns, so it may not be 100% accurate for complex orders
2. **Menu Items**: If menu item numbers are used, they must exist in the `menu_items` table
3. **Prices**: If prices aren't mentioned, the system will:
   - Use prices from menu items (if item numbers are used)
   - Calculate from business tax settings
   - Default to $0 if no price information is available

## Testing

To test order extraction:

1. Make a test call to your VAPI phone number
2. Place an order during the call (mention items, quantities, etc.)
3. End the call
4. Check server logs for:
   - `[VAPI Webhook] 📦 Detected order-related call`
   - `[VAPI Webhook] ✅✅✅ Order created successfully`
5. Check kiosk endpoint: `GET /api/kiosk/orders/active`
6. Verify order appears in kiosk interface

## Troubleshooting

**Orders not being created:**
- Check logs for `[Order Extraction]` messages
- Verify order keywords are present in transcript
- Ensure customer phone number is available (required field)

**Items not extracted correctly:**
- Review transcript in logs
- Check if item names match expected patterns
- Verify menu items exist if using item numbers

**Prices incorrect:**
- Check business tax settings (`takeout_tax_rate`, `takeout_tax_calculation_method`)
- Verify menu item prices are set correctly
- Review extracted totals in logs

## Future Improvements

Potential enhancements:
1. Use AI to better parse order structure from transcript
2. Support for delivery addresses
3. Better handling of modifications/customizations
4. Validation against actual menu items
5. Confirmation step before creating order

