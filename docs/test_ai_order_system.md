# Testing AI Takeout Order System

## Pre-Test Checklist

Before testing, ensure:
- [ ] "Takeout Orders" is enabled in Dashboard → Settings → AI Settings
- [ ] Assistant has been **REBUILT** after enabling takeout orders
- [ ] Menu items are created (at least one item with an item number)
- [ ] Backend server is running (`npm run dev`)
- [ ] Kiosk is accessible (you have the kiosk token URL)

## Step 1: Verify Assistant Has the Function

1. Go to VAPI Dashboard: https://dashboard.vapi.ai
2. Find your assistant (ID: `d01a8d92-6236-45c6-a7bb-5827419a255f`)
3. Check if it has a function called `submit_takeout_order`
4. If not, go to Dashboard → Settings → AI Settings and click "Rebuild Agent"

## Step 2: Place a Test Call

1. Call your business phone number
2. When AI answers, say: **"I want to place a takeout order"**
3. AI should:
   - Confirm your phone number (from call metadata)
   - Ask for your name
   - Wait for you to tell them what you want
4. Order an item using the item number, for example:
   - **"I'll have #1"** or **"I want number 1"**
5. AI should:
   - Confirm the item (e.g., "That's number 1, the Cheeseburger, correct?")
   - Ask for quantity
   - Ask if you want modifications (only if you ask about them)
   - Confirm the order with full pricing breakdown (subtotal, tax, total)
   - Tell you estimated ready time
   - **Call the `submit_takeout_order` function** ← This is critical
   - Use ending greeting when you're done

## Step 3: Monitor Webhook Logs

Watch your backend server console for these log entries:

### ✅ Success Indicators:
```
[VAPI Webhook] ⚙️ Processing function-call event
[VAPI Webhook] Function name: submit_takeout_order
[VAPI Webhook] 📦 Processing takeout order submission
[VAPI Webhook] Order data: { ... }
[VAPI Webhook] ✅ Found business: e0f461e0-6774-4055-8699-8c6a3d404596
[VAPI Webhook] ✅ Takeout order created: TO-2026-XXX (order_id)
[VAPI Webhook] Order details: { order_number, customer_name, items_count, total }
```

### ❌ Failure Indicators:
- No `function-call` event received → AI didn't call the function
- `Business not found` → Assistant ID mismatch
- `Customer phone number is required` → Function called without phone
- `Order must have at least one item` → Function called without items

## Step 4: Verify Order in Database

Run this SQL in Supabase to check if the order was created:

```sql
SELECT 
  id,
  order_number,
  customer_name,
  customer_phone,
  status,
  subtotal,
  tax,
  total,
  created_at
FROM takeout_orders
WHERE business_id = 'e0f461e0-6774-4055-8699-8c6a3d404596'
ORDER BY created_at DESC
LIMIT 1;
```

Check for order items:
```sql
SELECT 
  oi.item_name,
  oi.quantity,
  oi.unit_price,
  oi.item_total,
  oi.modifications
FROM takeout_order_items oi
JOIN takeout_orders o ON oi.order_id = o.id
WHERE o.order_number = 'TO-2026-XXX'  -- Replace with actual order number
ORDER BY oi.created_at;
```

## Step 5: Verify Order in Kiosk

1. Open the kiosk URL with your token
2. The new order should appear within 10 seconds (polling interval)
3. Check:
   - Order number is displayed
   - Customer name and phone are correct
   - Items are listed correctly
   - Modifications are shown (if any)
   - **Time shows in business timezone** (not UTC)
   - Countdown timer is correct (based on prep time)

## Troubleshooting

### AI Doesn't Call Function

**Symptoms:** Order conversation completes but no `function-call` event in logs

**Possible Causes:**
1. Assistant wasn't rebuilt after enabling takeout orders
2. Function doesn't exist in assistant configuration
3. AI didn't complete the order flow (got cut off)

**Solutions:**
1. Rebuild the assistant: Dashboard → Settings → AI Settings → "Rebuild Agent"
2. Verify function exists in VAPI dashboard
3. Try a more explicit order: "I want to place a takeout order for #1"

### Order Created But Not in Kiosk

**Symptoms:** Order in database but doesn't appear in kiosk

**Possible Causes:**
1. Kiosk polling hasn't refreshed yet (wait 10 seconds)
2. Order status is not 'pending', 'confirmed', 'preparing', or 'ready'
3. Kiosk token is wrong or expired

**Solutions:**
1. Wait 10-15 seconds for polling
2. Check order status in database
3. Regenerate kiosk token if needed

### Time Shows UTC Instead of Business Timezone

**Symptoms:** Order times show UTC time instead of business timezone

**Possible Causes:**
1. Settings not loaded yet
2. Timezone not set in business settings

**Solutions:**
1. Refresh kiosk page (settings should load)
2. Check business timezone in Dashboard → Settings → Business Info
3. Check browser console for `[Kiosk] Settings loaded:` log

## Expected Test Call Flow

1. **Call starts** → AI greets you
2. **You:** "I want to place a takeout order"
3. **AI:** "I have your number as [phone]. Is this the best number to reach you at?"
4. **You:** "Yes"
5. **AI:** "May I have your name for the order?"
6. **You:** "Christian"
7. **AI:** "Thank you, Christian. What would you like to order?"
8. **You:** "I'll have #1"
9. **AI:** "That's number 1, the Cheeseburger, correct? How many would you like?"
10. **You:** "1"
11. **AI:** "To confirm, you ordered 1 cheeseburger (number 1) for $14.99. With tax of $1.95, your total is $16.94. Your order will be ready in 30 minutes."
12. **AI:** [Calls `submit_takeout_order` function internally]
13. **AI:** "Is there anything else I can help you with?"
14. **You:** "No, that's all"
15. **AI:** [Uses ending greeting]
16. **Call ends**

## What to Look For

✅ **Success:**
- Function call appears in webhook logs
- Order appears in database
- Order appears in kiosk within 10 seconds
- All order details are correct
- Time shows in business timezone

❌ **Failure:**
- No function call in logs
- Order not in database
- Order not in kiosk
- Wrong timezone displayed
- Missing order details









