# ClickBank Webhook Testing Guide

## Overview

This guide explains how to test the ClickBank webhook handler that automatically creates accounts when customers purchase through ClickBank.

## How It Works

When a customer purchases through ClickBank:
1. ClickBank sends a webhook notification to `/api/clickbank/webhook`
2. The webhook handler detects which module was purchased (item number)
3. Creates a business account and user account
4. Activates the appropriate module subscription
5. Sends welcome email with login credentials

## Module Mapping

- **Item 1** = Phone Agent (old system - uses packages)
- **Item 2** = Review Reply (v2 system - uses subscriptions)

## Testing Methods

### Method 1: Use ClickBank's Test Mode

1. **Log into ClickBank Vendor Dashboard**
   - Go to: https://accounts.clickbank.com/
   - Navigate to **My Site** → **Advanced Tools**

2. **Set Up Test Webhook URL**
   - **Instant Notification URL**: `https://api.tavarios.com/api/clickbank/webhook`
   - **Secret Key**: Your `CLICKBANK_CLIENT_SECRET` (must match environment variable)
   - **Version**: `6.0`
   - Click **Save Changes**

3. **Make a Test Purchase**
   - Use ClickBank's test mode to simulate a purchase
   - Use test credit card: `4111 1111 1111 1111`
   - Expiry: Any future date
   - CVV: Any 3 digits
   - ClickBank will send webhook notifications to your endpoint

4. **Check Backend Logs**
   - Check Railway logs or server logs for webhook processing
   - Look for log messages starting with `[ClickBank]`
   - Verify account creation and email sending

### Method 2: Manual Webhook Simulation (Development)

You can simulate a ClickBank webhook using `curl` or Postman:

**For Review Reply Module (Item 2):**

```bash
curl -X POST https://api.tavarios.com/api/clickbank/webhook \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "transactionType=SALE" \
  -d "receipt=TEST-RECEIPT-12345" \
  -d "saleId=TEST-SALE-12345" \
  -d "itemNumber=2" \
  -d "customerEmail=test-purchase@example.com" \
  -d "customerFirstName=Test" \
  -d "customerLastName=Customer" \
  -d "amount=29.99"
```

**For Phone Agent Module (Item 1):**

```bash
curl -X POST https://api.tavarios.com/api/clickbank/webhook \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "transactionType=SALE" \
  -d "receipt=TEST-RECEIPT-12346" \
  -d "saleId=TEST-SALE-12346" \
  -d "itemNumber=1" \
  -d "customerEmail=test-phone@example.com" \
  -d "customerFirstName=Test" \
  -d "customerLastName=Customer" \
  -d "amount=119.00"
```

### Method 3: Local Testing (Development Only)

If testing locally with ngrok:

1. **Start ngrok tunnel:**
   ```bash
   ngrok http 5001
   ```

2. **Update ClickBank webhook URL temporarily:**
   - Use ngrok URL: `https://your-ngrok-url.ngrok.io/api/clickbank/webhook`

3. **Send test webhook:**
   ```bash
   curl -X POST http://localhost:5001/api/clickbank/webhook \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "transactionType=TEST" \
     -d "receipt=LOCAL-TEST-123" \
     -d "saleId=LOCAL-SALE-123" \
     -d "itemNumber=2" \
     -d "customerEmail=local-test@example.com" \
     -d "customerFirstName=Local" \
     -d "customerLastName=Test" \
     -d "amount=29.99"
   ```

## Expected Behavior

### For Review Reply Module (Item 2):

1. ✅ Business account created
2. ✅ User account created with secure password
3. ✅ Review Reply subscription created (status: active)
4. ✅ External purchase record created
5. ✅ Welcome email sent with login credentials
6. ✅ User can log in and see Review Reply module activated

### For Phone Agent Module (Item 1):

1. ✅ Business account created
2. ✅ User account created with secure password
3. ✅ Package assigned (Founder's Plan)
4. ✅ AI Agent created
5. ✅ Welcome email sent with login credentials
6. ✅ User can log in and see Phone Agent setup

## Verification Steps

After a webhook is processed:

1. **Check Database:**
   ```sql
   -- Check if user was created
   SELECT id, email, first_name, last_name FROM users WHERE email = 'test-purchase@example.com';
   
   -- Check if business was created
   SELECT id, name, email FROM businesses WHERE email = 'test-purchase@example.com';
   
   -- For Review Reply: Check subscription
   SELECT id, business_id, module_key, status, plan FROM subscriptions 
   WHERE business_id = (SELECT id FROM businesses WHERE email = 'test-purchase@example.com')
   AND module_key = 'reviews';
   
   -- Check external purchase record
   SELECT id, provider, external_order_id, module_key, status FROM external_purchases
   WHERE email = 'test-purchase@example.com';
   ```

2. **Check Email:**
   - Check the customer's email inbox for welcome email
   - Verify login credentials are included
   - Verify email mentions correct module name

3. **Test Login:**
   - Go to https://tavarios.com/login
   - Log in with credentials from email
   - Verify module is activated in dashboard

## Troubleshooting

### Webhook Not Received

- **Check ClickBank Configuration:**
  - Verify webhook URL is correct in ClickBank dashboard
  - Verify secret key matches `CLICKBANK_CLIENT_SECRET` environment variable
  - Check ClickBank webhook logs for delivery status

- **Check Backend Logs:**
  - Look for `[ClickBank Webhook]` log messages
  - Check for error messages
  - Verify webhook endpoint is accessible: `GET https://api.tavarios.com/api/clickbank/webhook`

### Account Not Created

- **Check Logs:**
  - Look for `[ClickBank]` log messages
  - Check for error messages in webhook processing
  - Verify database connection

- **Common Issues:**
  - Missing required fields in webhook (email, receipt, etc.)
  - Invalid item number (must be 1 or 2)
  - Account already exists (webhook will skip creation)
  - Database error (check connection and schema)

### Module Not Activated

- **For Review Reply:**
  - Check `subscriptions` table for record
  - Verify `module_key = 'reviews'`
  - Verify `status = 'active'`

- **For Phone Agent:**
  - Check `businesses` table for `package_id`
  - Check `ai_agents` table for agent record

### Email Not Sent

- Check email service configuration
- Verify `SENDGRID_API_KEY` or email service is configured
- Check email service logs
- Note: Account is still created even if email fails

## Important Notes

1. **Item Number Parameter:**
   - ClickBank may send item number as `itemNumber`, `item`, or `cbitems`
   - The code checks all three variations
   - Logs will show which parameter was found

2. **Existing Accounts:**
   - If email already exists, account creation is skipped
   - For Review Reply, module subscription will still be activated if missing
   - Check logs for "Account already exists" message

3. **Transaction Types:**
   - Only `SALE` and `TEST` transactions create accounts
   - `REFUND` transactions are handled by a separate webhook endpoint

4. **Security:**
   - Webhook signature verification is optional (if `CLICKBANK_CLIENT_SECRET` is set)
   - Always verify webhook URLs are correct in production

## Next Steps After Testing

1. ✅ Verify webhook is working correctly
2. ✅ Test with real ClickBank purchases (test mode first)
3. ✅ Monitor logs for any errors
4. ✅ Verify emails are being delivered
5. ✅ Test login flow for new customers
6. ✅ Set up monitoring/alerts for webhook failures

