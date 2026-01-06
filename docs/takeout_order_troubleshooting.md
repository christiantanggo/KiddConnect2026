# Takeout Order Troubleshooting Guide

## Issue: AI Takes Order But Doesn't Save It

Based on your logs, the AI took the order but **never called the `submit_takeout_order` function**. This means the order was never saved to the database.

### What Happened in Your Test Call

From the logs:
- ✅ Call started successfully
- ✅ AI collected order information (1 cheeseburger with extra cheese)
- ✅ AI confirmed the order
- ❌ **AI got cut off mid-sentence**: "The total will be 1"
- ❌ **No `function-call` event received** in webhook
- ❌ **Order was NOT saved to database**

### Possible Causes

1. **Assistant Not Rebuilt After Enabling Takeout Orders**
   - The function is only added to the assistant when it's rebuilt
   - If you enabled takeout orders but didn't rebuild, the function won't exist

2. **AI Didn't Complete Order Flow**
   - The AI got cut off before calling the function
   - The function is only called after the AI confirms the order with pricing

3. **Function Not Properly Configured**
   - The function might not be in the assistant configuration
   - Check VAPI dashboard to verify

## Diagnostic Steps

### Step 1: Verify Assistant Has the Function

1. Go to your VAPI dashboard
2. Find your assistant (ID: `d01a8d92-6236-45c6-a7bb-5827419a255f`)
3. Check if it has a function called `submit_takeout_order`
4. If not, **rebuild the assistant** from your dashboard settings

### Step 2: Rebuild Assistant

1. Go to your dashboard settings
2. Make sure "Takeout Orders" is enabled
3. Click "Rebuild Agent" button
4. Wait for rebuild to complete
5. Verify in VAPI dashboard that the function exists

### Step 3: Test Again

1. Place another test call
2. Complete the full order flow:
   - Give your name
   - Order an item (e.g., "I'll have #1")
   - Confirm quantity
   - Add modifications if needed
   - Wait for AI to confirm pricing
   - Wait for AI to say order is submitted
3. Check webhook logs for `function-call` event
4. Check database for new order

### Step 4: Check Webhook Logs

After placing a test order, look for these log entries:

```
[VAPI Webhook] ⚙️ Processing function-call event
[VAPI Webhook] Function name: submit_takeout_order
[VAPI Webhook] 📦 Processing takeout order submission
[VAPI Webhook] ✅ Takeout order created: TO-2026-XXX
```

If you don't see these, the function wasn't called.

## Quick Fix

**Most likely issue:** Assistant needs to be rebuilt after enabling takeout orders.

1. Go to Dashboard → Settings → AI Settings
2. Verify "Takeout Orders" toggle is ON
3. Click "Rebuild Agent" button
4. Wait for success message
5. Place another test call

## Verification Checklist

- [ ] Takeout Orders is enabled in settings
- [ ] Assistant was rebuilt AFTER enabling takeout orders
- [ ] Function `submit_takeout_order` exists in VAPI assistant dashboard
- [ ] Webhook URL is correct: `https://api.tavarios.com/api/vapi/webhook`
- [ ] Test call completes full order flow (not cut off)
- [ ] Webhook logs show `function-call` event
- [ ] Order appears in database after call

## Expected Flow

1. Customer calls → AI answers
2. Customer says "I want to place an order"
3. AI confirms phone number (from call metadata)
4. AI asks for name
5. Customer orders item(s)
6. AI confirms order with pricing breakdown
7. **AI calls `submit_takeout_order` function** ← This is what's missing
8. Webhook receives `function-call` event
9. Order saved to database
10. Order appears in kiosk within 10 seconds

## If Function Still Not Called

If the assistant is rebuilt and the function exists, but it's still not being called:

1. **Check AI Prompt**: The prompt should instruct the AI to call the function after confirming the order
2. **Check Function Description**: The function description should be clear about when to use it
3. **Try More Explicit Order**: Say "I want to place a takeout order for #1" to be very clear
4. **Check VAPI Logs**: VAPI dashboard may have more detailed logs about why function wasn't called

## Next Steps

1. **Rebuild the assistant** (most likely fix)
2. Place another test call
3. Monitor webhook logs for `function-call` event
4. Check database for new order
5. Check kiosk for new order

