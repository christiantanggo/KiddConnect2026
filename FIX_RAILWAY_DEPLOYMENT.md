# Fix Railway Deployment - Running Wrong Code

## The Problem

Railway is running the **OLD Telnyx code** from `archive/legacy-implementation/server.js` instead of the **NEW VAPI code** from `server.js`.

**Evidence:**
- Logs show: `✅ Ready to receive calls!` (old code)
- Should show: `✅ Tavari server running on port 5001 [VAPI VERSION]` (new code)

## The Fix

Railway must be configured incorrectly. Here's what to check:

### Step 1: Check Railway Service Settings

1. Go to [Railway Dashboard](https://railway.app)
2. Click on your **backend service** (usually named `tavari-ai-phone-agent` or similar)
3. Click **Settings** (or the gear icon)
4. Look for these settings:

#### A. Root Directory
- **MUST BE:** `/` or empty (project root)
- **WRONG:** `archive/legacy-implementation/` or anything else
- If it's wrong, change it to `/` and save

#### B. Start Command
- **MUST BE:** `npm start` or `node server.js`
- **WRONG:** Anything pointing to `archive/legacy-implementation/server.js`
- If it's wrong, change it to `npm start` and save

#### C. Build Command
- **SHOULD BE:** `npm install` or empty (Railway auto-detects)
- If it's wrong, set it to `npm install` or leave empty

### Step 2: Verify Environment Variables

In Railway Dashboard → Your Service → **Variables** tab, make sure you have:

**Required:**
- `PORT=5001`
- `NODE_ENV=production`
- `DATABASE_URL` (your Supabase connection string)
- `VAPI_API_KEY` (your VAPI API key)
- `VAPI_WEBHOOK_SECRET` (optional but recommended)
- `BACKEND_URL=https://api.tavarios.com` (or your Railway URL)
- `SUPABASE_URL` (your Supabase URL)
- `SUPABASE_SERVICE_ROLE_KEY` (your Supabase service key)
- `OPENAI_API_KEY` (your OpenAI key)
- `JWT_SECRET` (your JWT secret)
- `STRIPE_SECRET_KEY` (your Stripe key)

**Remove any old Telnyx variables:**
- `TELNYX_API_KEY` (if you're not using Telnyx anymore)
- `TELNYX_VOICE_APPLICATION_ID`
- `TELNYX_MESSAGING_PROFILE_ID`

### Step 3: Force Redeploy

After fixing the settings:

1. Go to **Deployments** tab
2. Click **"Redeploy"** on the latest deployment
3. OR click the three dots menu → **"Redeploy"**
4. Wait 2-5 minutes for deployment to complete

### Step 4: Verify New Code is Running

After deployment, check the logs. You should see:

```
============================================================
🚀 TAVARI SERVER - VAPI VERSION - DO NOT USE TELNYX CODE
============================================================
✅ Tavari server running on port 5001 [VAPI VERSION]
   Health check: http://localhost:5001/health
   Readiness check: http://localhost:5001/ready
   VAPI Webhook: http://localhost:5001/api/vapi/webhook
============================================================
```

**If you still see `✅ Ready to receive calls!`, the old code is still running.**

### Step 5: Test the Health Endpoint

After deployment, test:
```bash
curl https://api.tavarios.com/health
```

Should return:
```json
{
  "status": "ok",
  "version": "VAPI_VERSION",
  "server": "Tavari VAPI Server",
  "webhook": "/api/vapi/webhook",
  "message": "This is the VAPI version - NOT the Telnyx legacy version"
}
```

If it returns something different, Railway is still running the wrong code.

## Common Issues

### Issue: "I can't find Root Directory setting"
- Railway's UI may have changed
- Look for: **Settings** → **Service Settings** → **Root Directory**
- Or: **Settings** → **Deploy** → **Root Directory**
- If you can't find it, Railway might be using `railway.json` (which is correct)

### Issue: "Settings look correct but still running old code"
1. Check if there are **multiple services** - you might be looking at the wrong one
2. Check the **Deployments** tab - is a new deployment actually running?
3. Check the **commit hash** in the deployment - does it match your latest commit?
4. Try **disconnecting and reconnecting** the GitHub repo

### Issue: "Deployment fails"
- Check the **Build Logs** for errors
- Make sure all environment variables are set
- Check that `package.json` has the correct `start` script

## Still Not Working?

If Railway is still running the old code after all this:

1. **Delete the service** and create a new one
2. **Connect it to GitHub** again
3. **Set Root Directory to `/`**
4. **Set Start Command to `npm start`**
5. **Add all environment variables**
6. **Deploy**

This will ensure a clean deployment with the correct configuration.



















