# Telnyx Webhook Configuration for SMS Opt-Out

This guide explains how to configure Telnyx webhooks to handle STOP/START opt-out messages for your SMS campaigns.

## Webhook URL

Your webhook endpoint is:
```
https://api.tavarios.com/api/bulk-sms/webhook
```

## Configuration Steps

### Step 1: Log into Telnyx Dashboard

1. Go to [https://portal.telnyx.com](https://portal.telnyx.com)
2. Log in with your Telnyx account credentials

### Step 2: Navigate to Messaging Profiles

**Perfect! You're already on the Messaging Profiles page!** 

You should see a table with your messaging profiles. Each profile has:
- **Name** (e.g., "Tavari-Communication-Agent")
- **Status** (green dot = active)
- **Webhook URL** (currently shows "-" or an existing URL)
- **Failover URL**
- **Numbers** (how many phone numbers are assigned)

### Step 3: Edit Your Messaging Profile

1. **Identify which profile to edit:**
   - If you see **"Tavari-Communication-Agent"** with numbers assigned (e.g., "3" numbers), edit that one
   - OR edit the profile that has your SMS phone numbers assigned to it

2. **Click the Edit icon (pencil icon)** on the row of the profile you want to configure

3. **This will open the profile edit page** where you can set the webhook URL

### Step 4: Configure Webhook URL

On the profile edit page:

1. **Look for "Inbound Settings" section** - this is where the webhook URL is configured

2. **Find the "Webhook URL" field** within the Inbound Settings section

3. **Enter your webhook URL:**
   ```
   https://api.tavarios.com/api/bulk-sms/webhook
   ```

4. **Optional: Set Failover URL** (if you have a backup webhook endpoint)

5. **Save the changes** - click "Save" or "Update" button at the bottom of the page

**Note:** The webhook URL you set here will receive **all incoming SMS messages** sent to phone numbers assigned to this messaging profile. This is exactly what we need for STOP/START functionality!

### Step 4: Save Configuration

1. Click **"Save"** or **"Update"**
2. Telnyx will test the webhook URL to ensure it's accessible
3. If the test fails, check:
   - Your server is running and accessible
   - The URL is correct (including `https://`)
   - Your firewall/security settings allow Telnyx IPs

### Step 5: Verify Webhook is Working

1. Send a test SMS to your business phone number
2. Text "STOP" to your business number
3. Check your backend logs - you should see:
   ```
   [BulkSMS Webhook] Received webhook: ...
   [BulkSMS Webhook] Opt-out keyword detected, processing...
   [BulkSMS Webhook] ✅ Opt-out recorded in sms_opt_outs: ...
   [BulkSMS Webhook] ✅ Confirmation SMS sent to ...
   ```
4. You should receive a confirmation message: "You have been unsubscribed from receiving SMS messages. Reply START to opt back in."

## Webhook Security (Optional but Recommended)

If you want to verify webhook authenticity:

1. In Telnyx Dashboard → Messaging → Settings
2. Find **"Webhook Secret"** or **"Webhook Signature Secret"**
3. Copy the secret
4. Add it to your environment variables:
   ```
   TELNYX_WEBHOOK_SECRET=your_secret_here
   ```
5. Update the webhook handler to verify the signature (future enhancement)

## Testing

### Test Opt-Out
1. Send "STOP" to your business phone number
2. Verify:
   - ✅ Confirmation SMS received
   - ✅ Number appears in Opt-Outs tab in dashboard
   - ✅ Contact (if exists) is marked as opted out

### Test Opt-In
1. Send "START" to your business phone number
2. Verify:
   - ✅ Confirmation SMS received
   - ✅ Number removed from Opt-Outs tab
   - ✅ Contact (if exists) is marked as opted in

## Troubleshooting

### Webhook Not Receiving Messages

1. **Check Telnyx Dashboard:**
   - Go to Messaging → Webhooks
   - Verify the webhook URL is correct
   - Check webhook delivery logs for errors

2. **Check Your Server:**
   - Ensure server is running: `npm run dev`
   - Check server logs for webhook requests
   - Verify the endpoint is accessible: `https://api.tavarios.com/api/bulk-sms/webhook`

3. **Check Firewall/Security:**
   - Ensure Telnyx IPs are whitelisted (if using firewall)
   - Check SSL certificate is valid
   - Verify CORS settings allow Telnyx requests

### Webhook Receiving but Not Processing

1. **Check Logs:**
   - Look for `[BulkSMS Webhook]` entries in your server logs
   - Check for error messages

2. **Verify Phone Number Format:**
   - Ensure phone numbers are in E.164 format (+1234567890)
   - Check that `Business.findByPhoneNumber()` is finding your business

3. **Test Manually:**
   - Use the test SMS button in the dashboard
   - Send a test "STOP" message and check logs

## Support

If you continue to have issues:
1. Check Telnyx documentation: [https://developers.telnyx.com/docs](https://developers.telnyx.com/docs)
2. Review server logs for detailed error messages
3. Verify your Telnyx API key is configured correctly

