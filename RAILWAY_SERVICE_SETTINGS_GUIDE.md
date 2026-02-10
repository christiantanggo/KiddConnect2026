# How to Find Railway Service Settings

## The Problem
You're currently on **Project Settings** (general project info), but you need **Service Settings** (where Root Directory and Start Command are).

## Step-by-Step Navigation

### Step 1: Go to Your Service
1. From the Railway dashboard, click on **"Tavari-Communications-Agent"** project
2. You should see a list of **services** (like `tavari-ai-phone-agent` or similar)
3. **Click on the backend service** (the one that runs your server)

### Step 2: Open Service Settings
Once you're on the service page:
1. Look for a **"Settings"** tab or button (usually at the top)
2. OR click the **three dots menu** (⋯) next to the service name
3. Click **"Settings"**

### Step 3: Find Root Directory and Start Command
In Service Settings, look for:
- **"Root Directory"** - Should be `/` or empty
- **"Start Command"** - Should be `npm start`
- **"Build Command"** - Should be `npm install` or empty

These are usually in a section called:
- "Deploy" or
- "Build & Deploy" or
- "Service Configuration"

## Alternative: Check via Deployments Tab

If you can't find Service Settings:
1. Go to your service
2. Click **"Deployments"** tab
3. Look at the latest deployment
4. Check what **commit** it's deploying from
5. Check if there are any **build errors**

## Quick Check: What's Actually Running?

To verify what code is running RIGHT NOW:

1. Go to your service
2. Click **"Logs"** tab
3. Look for the startup message:
   - ❌ `✅ Ready to receive calls!` = OLD CODE (wrong!)
   - ✅ `🚀 TAVARI SERVER - VAPI VERSION` = NEW CODE (correct!)

## If You Still Can't Find It

Railway's UI might have changed. Try:
1. Click on your **service name** (not project name)
2. Look for a **gear icon** ⚙️ or **settings icon**
3. Check the **right sidebar** when viewing the service
4. Look for **"Configure"** or **"Edit"** buttons

## What to Change

Once you find Service Settings:

1. **Root Directory:** Change to `/` (or leave empty if it's already empty)
2. **Start Command:** Change to `npm start`
3. **Save** the changes
4. **Redeploy** (click "Redeploy" button or push a new commit)

## Node.js version (Supabase / AWS SDK warnings)

If logs show **Node.js 18** and warnings from `@supabase/supabase-js` or AWS SDK about upgrading to Node 20:

1. The repo now has **`.nvmrc`** with `20` and **`package.json`** `engines.node = "20"` so Nixpacks should use Node 20 on the next build.
2. If Railway still uses Node 18 after redeploying, set a **build variable**:
   - Go to your **service** → **Variables** (or **Settings** → **Variables**).
   - Add: **`NIXPACKS_NODE_VERSION`** = **`20`**.
   - Redeploy so the build runs with Node 20.



















