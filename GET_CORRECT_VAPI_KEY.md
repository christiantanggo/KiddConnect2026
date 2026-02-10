# Get the Correct VAPI API Key

## Issue
Your current `VAPI_API_KEY` appears to be in the wrong format. VAPI API keys should start with `sk_` (private) or `pk_` (public).

## Steps to Fix

### 1. Go to VAPI Dashboard
Visit: **https://dashboard.vapi.ai**

### 2. Navigate to API Keys
1. Click on **Settings** (gear icon or in the menu)
2. Click on **API Keys** or **API Keys & Webhooks**

### 3. Find Your Private Key
You should see:
- **Public Key** (starts with `pk_...`) - for client-side use
- **Private Key** (starts with `sk_...`) - for server-side use ← **YOU NEED THIS ONE**

### 4. Copy the Private Key
- Click the copy button next to the **Private Key**
- It should look like: `sk_abc123def456...` (long string starting with `sk_`)

### 5. Update Your .env File
1. Open `.env` in your project root
2. Find the line: `VAPI_API_KEY=dfe3b948-cb12-4dea-b684-4d65dd5399ae`
3. Replace it with: `VAPI_API_KEY=sk_your_actual_private_key_here`
4. **Important:** No quotes, no spaces, just the key directly

### 6. Save and Restart
1. Save the `.env` file
2. Restart your server (if running)
3. Test again: `npm run test:phone`

## If You Don't See API Keys

If you don't see API keys in the dashboard:
1. You might need to create one
2. Look for a "Create API Key" or "Generate Key" button
3. Make sure to create a **Private Key** (server-side key)

## Verification

After updating, your `.env` should have:
```env
VAPI_API_KEY=sk_abc123def456ghi789jkl012mno345pqr678stu901vwx234yz
```

**NOT:**
- ❌ `dfe3b948-cb12-4dea-b684-4d65dd5399ae` (UUID format)
- ❌ `pk_...` (public key)
- ❌ `"sk_..."` (with quotes)
- ❌ `sk_... ` (with trailing space)

## Test Again

After updating, run:
```bash
npm run test:phone
```

You should now see:
- ✅ VAPI_API_KEY is set
- ✅ Found 1 Telnyx credential(s)
- ✅ Phone number provisioned successfully



















