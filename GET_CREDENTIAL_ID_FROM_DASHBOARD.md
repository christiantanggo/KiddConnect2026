# Get Telnyx Credential ID from VAPI Dashboard

## The Issue

Your API key works for some endpoints (like `/assistant`) but fails for `/credential` and `/phone-number`. This suggests you need to manually get the credential ID from the dashboard.

## Solution: Get Credential ID from Dashboard

### Step 1: Go to VAPI Dashboard
Visit: **https://dashboard.vapi.ai**

### Step 2: Navigate to Credentials
1. Click **Settings** (gear icon)
2. Click **Integrations** or **Credentials**
3. Look for **Telnyx** in the connected integrations

### Step 3: Find the Credential ID
1. Click on the **Telnyx** integration/credential
2. Look for an **ID** or **Credential ID** field
3. It should be a UUID like: `c978be20-580b-435d-a03a-51ad7bfdfa1c`
4. **Copy this ID**

### Step 4: Add to .env File
1. Open your `.env` file
2. Add this line (or update if it exists):
   ```env
   VAPI_TELNYX_CREDENTIAL_ID=c978be20-580b-435d-a03a-51ad7bfdfa1c
   ```
3. Replace `c978be20-580b-435d-a03a-51ad7bfdfa1c` with your actual credential ID
4. **Save the file**

### Step 5: Test Again
```bash
npm run test:phone
```

## Alternative: Check if Credential is Already Set

If you already have a credential ID from a previous test, check your `.env`:
```bash
# In PowerShell:
Get-Content .env | Select-String "VAPI_TELNYX_CREDENTIAL_ID"
```

If it shows a UUID, that's your credential ID. Make sure it matches what's in the VAPI dashboard.

## Why This Is Needed

The `/phone-number` endpoint requires a `credentialId` to know which Telnyx account to use for provisioning. Even though your API key works, VAPI needs to know which specific Telnyx credential to use.

## Verification

After adding the credential ID, the test should show:
- ✅ Using configured Telnyx credential: `<your-uuid>`
- ✅ Phone number provisioned successfully
















