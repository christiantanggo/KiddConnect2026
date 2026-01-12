# Testing Phone Number Provisioning

## Quick Test

Run the test script to verify phone provisioning works:

```bash
npm run test:phone
```

This will:
1. Check if VAPI API key is set
2. Check if Telnyx credentials are available
3. Attempt to provision a phone number
4. Show the result

## What to Check

### 1. Server Logs During Signup

When a user signs up, check your server logs for:

```
[VAPI] Auto-detecting Telnyx credential...
[VAPI] Found 1 Telnyx credential(s)
[VAPI] ✅ Using auto-detected Telnyx credential: <uuid>
[VAPI] Provisioning phone number with credentialId: <uuid>
[VAPI] ✅ Phone number provisioned successfully
[VAPI] Phone number: +1...
[Signup] Phone number provisioned: +1...
```

### 2. Check Database

After signup, verify the phone number was stored:

```sql
SELECT id, name, vapi_phone_number, vapi_assistant_id 
FROM businesses 
WHERE email = 'user@example.com';
```

The `vapi_phone_number` field should contain the provisioned number.

### 3. Check Dashboard

After logging in, the dashboard should show:
- Phone number in the "Forward calls to" section
- "Phone number provisioned" checked in the setup checklist

## Common Issues

### Issue: "credentialId must be a UUID"

**Solution:**
1. Run `npm run test:vapi` to get your credential ID
2. Add to `.env`: `VAPI_TELNYX_CREDENTIAL_ID=<your-uuid>`
3. Restart server

### Issue: Phone Number Not Showing in Dashboard

**Check:**
1. Server logs during signup - did provisioning succeed?
2. Database - is `vapi_phone_number` set?
3. Browser console - any errors loading user data?

### Issue: Provisioning Fails Silently

**Check server logs for:**
- VAPI API errors
- Credential errors
- Network errors

The error should be logged with full details.

## Manual Test

If you want to test provisioning manually:

1. **Start your server:**
   ```bash
   npm start
   ```

2. **In another terminal, run the test:**
   ```bash
   npm run test:phone
   ```

3. **Check the output:**
   - Should show credential check
   - Should show phone number provisioned
   - Should show the phone number value

## Debugging

If provisioning fails:

1. **Check VAPI Dashboard:**
   - Go to https://dashboard.vapi.ai
   - Check "Phone Numbers" section
   - See if any numbers were created

2. **Check Credentials:**
   - Go to Settings → Credentials
   - Verify Telnyx credential is active
   - Copy the credential ID

3. **Check Environment:**
   ```bash
   # Verify these are set:
   echo $VAPI_API_KEY
   echo $VAPI_TELNYX_CREDENTIAL_ID
   ```

4. **Check Server Logs:**
   - Look for `[VAPI]` prefixed messages
   - Look for error messages
   - Check the full error response

## Expected Behavior

✅ **Success:**
- Phone number is provisioned
- Phone number is stored in database
- Phone number appears in dashboard
- Assistant is linked to phone number

❌ **Failure:**
- Error is logged with details
- Signup still succeeds (account created)
- User can retry activation from admin dashboard
- Error message is shown to user
















