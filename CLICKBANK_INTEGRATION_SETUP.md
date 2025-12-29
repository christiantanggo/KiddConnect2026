# ClickBank Integration Setup Guide

This guide explains how to set up ClickBank's Instant Notification Service (INS) to automatically create customer accounts when purchases are made through ClickBank.

## Overview

When a customer purchases Tavari AI through ClickBank, the system will:
1. Receive an order notification via ClickBank's INS webhook
2. Automatically create a business account and user account
3. Assign the Founder's Plan ($119/month)
4. Generate a secure password
5. Send a welcome email with login credentials
6. Set up a default AI agent

## Step 1: Run Database Migration

First, run the migration to add ClickBank tracking fields to the businesses table:

```bash
# In Supabase SQL Editor or via psql, run:
# migrations/add_clickbank_fields.sql
```

This adds:
- `clickbank_receipt` - Stores the ClickBank receipt number
- `clickbank_sale_id` - Stores the ClickBank sale ID

## Step 2: Configure Environment Variables

Add the following to your `.env` file:

```env
# ClickBank Integration (Optional - for signature verification)
CLICKBANK_CLIENT_SECRET=your_clickbank_client_secret_here

# Frontend URL (for welcome emails)
FRONTEND_URL=https://tavarios.com
# OR
NEXT_PUBLIC_API_URL=https://api.tavarios.com
```

**Note:** `CLICKBANK_CLIENT_SECRET` is optional. If not configured, signature verification will be skipped (not recommended for production).

## Step 3: Configure ClickBank INS (Instant Notification Service)

1. **Log in to ClickBank:**
   - Go to https://accounts.clickbank.com
   - Navigate to your account

2. **Access Vendor Settings:**
   - Click "Accounts" in the left sidebar
   - Select "My Site" from the main navigation
   - Or go directly to: https://accounts.clickbank.com/master/vendorSettings.html

3. **Set Up INS URL:**
   - Find the "Instant Notification Service (INS)" section
   - Enter your webhook URL:
     ```
     https://api.tavarios.com/api/clickbank/webhook
     ```
   - Click "Save" or "Update"

4. **Configure INS Settings:**
   - Enable INS notifications
   - Select the transaction types to receive (typically: SALE, RFND, CGBK, etc.)
   - Save your settings

## Step 4: Verify Webhook Endpoint

Test that your webhook endpoint is accessible:

```bash
curl https://api.tavarios.com/api/clickbank/webhook
```

You should receive a JSON response confirming the endpoint is accessible.

## Step 5: Test the Integration

### Option A: Use ClickBank's Test Mode

1. In ClickBank, enable test mode
2. Make a test purchase using your paylink
3. Check your server logs for the webhook notification
4. Verify that an account was created

### Option B: Manual Test (Development)

You can simulate a ClickBank notification by sending a POST request:

```bash
curl -X POST https://api.tavarios.com/api/clickbank/webhook \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "transactionType=SALE" \
  -d "receipt=TEST-RECEIPT-123" \
  -d "customerEmail=test@example.com" \
  -d "customerFirstName=Test" \
  -d "customerLastName=User" \
  -d "saleId=TEST-SALE-123" \
  -d "amount=119.00" \
  -d "currency=CAD"
```

**Note:** This is for testing only. In production, ClickBank will send real notifications automatically.

## How It Works

### Account Creation Flow

1. **Customer purchases through ClickBank:**
   - Customer clicks your ClickBank paylink
   - Completes payment on ClickBank
   - ClickBank processes the payment

2. **ClickBank sends INS notification:**
   - ClickBank sends a POST request to `/api/clickbank/webhook`
   - Includes transaction details (email, name, receipt, etc.)
   - Signature is verified (if `CLICKBANK_CLIENT_SECRET` is configured)

3. **System processes the order:**
   - Checks if account already exists (skips if exists)
   - Creates business account
   - Creates user account with secure random password
   - Assigns Founder's Plan ($119/month)
   - Creates default AI agent
   - Stores ClickBank receipt and sale ID

4. **Welcome email sent:**
   - Customer receives email with login credentials
   - Includes password and link to dashboard
   - Customer can log in and complete setup

### Password Generation

- Passwords are 16 characters long
- Include uppercase, lowercase, numbers, and symbols
- Generated using cryptographically secure random bytes
- **Important:** Customers are instructed to change their password after first login

### Package Assignment

- Customers are automatically assigned the Founder's Plan
- The system looks for a package with `monthly_price = 119`
- If not found, uses the first available active package
- Package is assigned via `package_id` field on business record

## Troubleshooting

### Webhook Not Receiving Notifications

1. **Check ClickBank INS URL:**
   - Verify the URL is correct: `https://api.tavarios.com/api/clickbank/webhook`
   - Ensure there are no typos

2. **Check Server Logs:**
   ```bash
   # Look for ClickBank webhook logs
   [ClickBank Webhook] ========== WEBHOOK REQUEST RECEIVED ==========
   ```

3. **Verify Endpoint Accessibility:**
   ```bash
   curl https://api.tavarios.com/api/clickbank/webhook
   ```

4. **Check ClickBank Settings:**
   - Ensure INS is enabled
   - Verify transaction types are selected
   - Check ClickBank dashboard for delivery errors

### Account Creation Fails

1. **Check Database:**
   - Ensure migration was run (`clickbank_receipt`, `clickbank_sale_id` columns exist)
   - Verify pricing package exists (Founder's Plan at $119/month)

2. **Check Server Logs:**
   - Look for error messages in the ClickBank webhook logs
   - Common errors:
     - "No active pricing package found" - Create a pricing package
     - "Account already exists" - Customer already has an account (this is expected)

3. **Verify Email Sending:**
   - Check email service configuration
   - Welcome email may fail silently (account is still created)

### Duplicate Account Prevention

- The system checks if an account with the customer's email already exists
- If an account exists, the webhook returns "OK" but skips account creation
- This prevents duplicate accounts if ClickBank sends duplicate notifications

## Security Considerations

1. **Signature Verification:**
   - Always configure `CLICKBANK_CLIENT_SECRET` in production
   - This verifies that notifications are actually from ClickBank

2. **HTTPS Required:**
   - Webhook endpoint must be served over HTTPS
   - ClickBank will not send notifications to HTTP endpoints

3. **Password Security:**
   - Passwords are generated securely using crypto.randomBytes
   - Customers are instructed to change passwords after first login
   - Passwords are hashed using bcrypt before storage

4. **Rate Limiting:**
   - Consider adding rate limiting to the webhook endpoint if needed
   - ClickBank typically sends notifications reliably, but protection is good practice

## Monitoring

Monitor the following to ensure the integration is working:

1. **Server Logs:**
   - `[ClickBank Webhook]` - Webhook requests
   - `[ClickBank]` - Order processing

2. **Database:**
   - Check `businesses` table for new accounts with `clickbank_receipt` set
   - Monitor `users` table for new user accounts

3. **Email Delivery:**
   - Monitor email service for welcome email delivery
   - Check for bounced emails or delivery failures

## Next Steps

After setting up the integration:

1. **Test with a real purchase** (using ClickBank test mode)
2. **Monitor the first few orders** to ensure everything works correctly
3. **Verify welcome emails** are being sent and received
4. **Check customer accounts** are being created correctly
5. **Confirm package assignment** is correct (Founder's Plan)

## Support

If you encounter issues:

1. Check server logs for detailed error messages
2. Verify all configuration steps were completed
3. Test the webhook endpoint manually
4. Contact ClickBank support if webhook delivery issues persist
5. Contact Tavari support at info@tanggo.ca

