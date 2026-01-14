# How to Make a Test Purchase in ClickBank

## Quick Steps

1. **Generate Test Credit Card in ClickBank:**
   - Log in: https://accounts.clickbank.com/
   - Navigate to: **Vendor Settings** → **My Site**
   - Scroll to: **Testing Your Products** section
   - Click: **Edit** or **Generate New Card Number**
   - Copy the test card number, expiration date, and CVV

2. **Make Test Purchase:**
   - Go to: https://tavarios.pay.clickbank.net/?cbitems=2
   - Fill in order form with any information
   - Use the test credit card details from Step 1
   - Submit the order

3. **Verify Webhook:**
   - Check backend logs for `[ClickBank Webhook]` messages
   - Verify account was created in database
   - Check email for welcome message

## Detailed Instructions

### Step 1: Generate Test Credit Card

1. Log into ClickBank Vendor Dashboard
2. Go to **Vendor Settings** tab
3. Click **My Site**
4. Scroll down to **Testing Your Products** section
5. Click **Edit** or **Generate New Card Number**
6. Click **Generate New Card Number** button
7. Copy the generated:
   - Card Number (16 digits)
   - Expiration Date (MM/YY)
   - CVV (3 digits)

**Note:** Test cards expire quickly (usually within 15-30 minutes), so use them promptly.

### Step 2: Make Test Purchase

1. Open your payment link in a new browser tab:
   - Review Reply: https://tavarios.pay.clickbank.net/?cbitems=2
   - Phone Agent: https://tavarios.pay.clickbank.net/?cbitems=1

2. Fill in the ClickBank order form:
   - **Customer Information:**
     - Email: Use a test email (e.g., `test-clickbank@example.com`)
     - First Name: Test
     - Last Name: Customer
     - Address: Any valid address
     - Country: Select any country
     - Zip Code: Any valid zip code
   
   - **Payment Information:**
     - Card Number: Use the test card number from Step 1
     - Expiration Date: Use the expiration from Step 1
     - CVV: Use the CVV from Step 1
     - Cardholder Name: Any name

3. Review the order and click **Pay Now** or **Submit Order**

4. You should be redirected to a Thank You page (if configured) or see a success message

### Step 3: Verify the Webhook Worked

#### Check Backend Logs

Look for these log messages in your backend (Railway logs, server logs, etc.):

```
[ClickBank Webhook] ========== WEBHOOK REQUEST RECEIVED ==========
[ClickBank Webhook] Processing transaction: SALE | Receipt: [receipt-number] | Email: [your-email]
[ClickBank] ========== PROCESSING CLICKBANK ORDER ==========
[ClickBank] Module detected: reviews (item number: 2)
[ClickBank] ✅ Business created: [business-id]
[ClickBank] ✅ User created: [user-id]
[ClickBank] ✅ Review Reply subscription created: [subscription-id]
[ClickBank] ✅ Welcome email sent to [your-email]
[ClickBank Webhook] ✅ Account created successfully for [your-email]
```

#### Check Database

Verify the account was created:

**Check User:**
```sql
SELECT id, email, first_name, last_name, business_id 
FROM users 
WHERE email = 'test-clickbank@example.com';
```

**Check Business:**
```sql
SELECT id, name, email 
FROM businesses 
WHERE email = 'test-clickbank@example.com';
```

**Check Subscription (for Review Reply):**
```sql
SELECT id, business_id, module_key, status, plan 
FROM subscriptions 
WHERE business_id = (
  SELECT id FROM businesses WHERE email = 'test-clickbank@example.com'
)
AND module_key = 'reviews';
```

**Check External Purchase:**
```sql
SELECT id, provider, external_order_id, module_key, status 
FROM external_purchases 
WHERE email = 'test-clickbank@example.com';
```

#### Check Email

1. Check the email inbox you used for the test purchase
2. You should receive a welcome email with:
   - Login credentials (email and password)
   - Instructions on how to access your account
   - Module name in the subject line (e.g., "Welcome to Tavari AI Review Reply")

#### Test Login

1. Go to: https://tavarios.com/login
2. Log in with:
   - Email: The email you used for the test purchase
   - Password: The password from the welcome email
3. Verify:
   - You can log in successfully
   - Dashboard loads
   - Review Reply module is activated (for item 2)
   - Or Phone Agent is activated (for item 1)

## Troubleshooting

### Webhook Not Received

**Check:**
- Webhook URL is correct in ClickBank: `https://api.tavarios.com/api/clickbank/webhook`
- Your backend server is running and accessible
- Check ClickBank webhook logs (in ClickBank dashboard) for delivery status

**Test webhook endpoint:**
```bash
curl https://api.tavarios.com/api/clickbank/webhook
```

Should return:
```json
{
  "status": "✅ ClickBank webhook endpoint is accessible",
  "webhookUrl": "https://api.tavarios.com/api/clickbank/webhook"
}
```

### Account Not Created

**Check:**
- Backend logs for errors
- Database connection is working
- All required fields were sent in webhook (email, receipt, itemNumber, etc.)

**Common Issues:**
- Missing `itemNumber` parameter - check logs to see what parameters ClickBank sent
- Invalid item number - must be 1 or 2
- Email already exists - webhook will skip creation but may activate module

### Email Not Sent

**Check:**
- Email service is configured (SendGrid, etc.)
- Email service logs for errors
- Account is still created even if email fails (check database)

### Module Not Activated

**For Review Reply:**
- Check `subscriptions` table for record with `module_key='reviews'`
- Verify `status='active'`

**For Phone Agent:**
- Check `businesses` table for `package_id`
- Check `ai_agents` table for agent record

## Important Notes

1. **Test Credit Cards:**
   - Test cards expire quickly (usually 15-30 minutes)
   - Generate a new one if it expires
   - Test purchases don't charge real money

2. **Webhook Timing:**
   - Webhook should trigger immediately after purchase
   - If not received within a few minutes, check configuration

3. **Item Number:**
   - Item 1 = Phone Agent (old system)
   - Item 2 = Review Reply (v2 system)
   - The `?cbitems=2` in the URL determines which module

4. **Test vs Real Purchases:**
   - Test purchases work the same as real purchases for webhook testing
   - Use test mode for development, real purchases for production

## Next Steps After Testing

1. ✅ Verify webhook works correctly
2. ✅ Test with both modules (item 1 and item 2)
3. ✅ Verify emails are sent
4. ✅ Test login flow for new customers
5. ✅ Monitor logs for any errors
6. ✅ Ready for production purchases!

