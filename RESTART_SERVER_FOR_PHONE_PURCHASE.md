# Server Restart Required for Phone Purchase

## Issue

The phone number purchase functionality requires a server restart to load the updated code.

## Solution

**Restart the server:**

1. **Stop the current server:**
   - Press `Ctrl+C` in the terminal where the server is running
   - OR kill the process:
     ```bash
     # Windows PowerShell
     Get-Process -Name node | Stop-Process -Force
     
     # Or find and kill specific port
     netstat -ano | findstr :5001
     taskkill /PID <PID> /F
     ```

2. **Start the server again:**
   ```bash
   npm start
   ```

## What Changed

The following files were updated and require a server restart:

1. **`services/vapi.js`**
   - Updated `purchaseTelnyxNumber()` to use `/number_orders` endpoint
   - Added area code matching logic
   - Added fallback to `/phone_numbers` endpoint

2. **`services/vapi.js`**
   - Updated `provisionPhoneNumber()` to accept `businessPhoneNumber` parameter
   - Added area code extraction and matching

3. **`utils/phoneFormatter.js`**
   - Added `extractAreaCode()` function

4. **`routes/auth.js`**
   - Updated to pass `businessPhoneNumber` to `provisionPhoneNumber()`
   - Added handling for `existing_tavari_number` from request body

## Verification

After restarting, test the signup flow:

1. Go to signup page
2. Enter business information
3. Enter business phone number (e.g., +1 555-123-4567)
4. Leave "I already have a Tavari number" unchecked (for auto-purchase)
5. Complete signup

The system should:
- ✅ Extract area code from business phone
- ✅ Search for numbers matching that area code
- ✅ Purchase number via Telnyx `/number_orders` endpoint
- ✅ Provision to VAPI
- ✅ Display the provisioned number

## Troubleshooting

If it still doesn't work after restart:

1. **Check server logs** for errors
2. **Verify environment variables:**
   ```bash
   # Check .env file has:
   TELNYX_API_KEY=your_key_here
   VAPI_API_KEY=your_key_here
   VAPI_TELNYX_CREDENTIAL_ID=your_uuid_here
   ```

3. **Test phone purchase directly:**
   ```bash
   npm run test:phone
   ```

4. **Check browser console** for frontend errors
















