# Deployment Checklist for Orbix Network

## Issues Fixed
✅ **Reviews module route error** - Fixed empty `reviews.js` file  
✅ **Server auto-restart** - Use `npm start` (not `npm run dev`) in production

## Pre-Deployment Issues to Resolve

### 1. Supabase DNS Error
**Error:** `ENOTFOUND bedpfioivdcgpsrdxozi.supabase.co`

**Fix:**
1. Check your `.env` file for `SUPABASE_URL`
2. Verify the URL is correct in Supabase Dashboard → Settings → API
3. Format should be: `https://bedpfioivdcgpsrdxozi.supabase.co` (no trailing slash)
4. Ensure `SUPABASE_SERVICE_ROLE_KEY` is also set correctly

### 2. Local Development Auto-Restart Issue

**Problem:** `npm run dev` uses `node --watch` which restarts on every file change, making development difficult.

**Solutions:**

**Option A: Use production mode locally (no auto-restart)**
```bash
npm start
```
This runs `node server.js` without file watching.

**Option B: Exclude files from watch (if using nodemon)**
If you want auto-restart but less frequently, you could modify `package.json`:
```json
"dev": "nodemon --ignore 'node_modules' --ignore '.git' --ignore 'frontend' server.js"
```

**Option C: Use separate terminal for frontend**
Run backend with `npm start` in one terminal, frontend with `cd frontend && npm run dev` in another.

## Deployment Steps

### Backend (Railway)

1. **Push to GitHub** (main branch)
   ```bash
   git add .
   git commit -m "Fix reviews route and prepare for deployment"
   git push origin main
   ```

2. **Verify Railway Auto-Deploy**
   - Railway will auto-detect push and start building
   - Check Railway dashboard for build logs

3. **Environment Variables in Railway**
   Ensure these are set in Railway → Variables:
   - `SUPABASE_URL` (must be correct URL)
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENAI_API_KEY`
   - `YOUTUBE_CLIENT_ID`
   - `YOUTUBE_CLIENT_SECRET`
   - `YOUTUBE_REDIRECT_URI`
   - All other required env vars

4. **Verify Deployment**
   - Check Railway logs for successful startup
   - Test health endpoint: `https://your-railway-url.railway.app/health`
   - Verify no errors in logs

### Frontend (Vercel)

1. **Auto-Deploys** on push to main (already configured)

2. **Environment Variables in Vercel**
   Ensure these are set in Vercel → Settings → Environment Variables:
   - `NEXT_PUBLIC_API_URL` (should be your Railway backend URL)

3. **Verify Deployment**
   - Check Vercel dashboard for successful build
   - Test frontend URL

## Supabase Storage Setup

Before deploying, ensure:

1. **Buckets Created:**
   - ✅ `orbix-network-backgrounds` (already created)
   - ✅ `orbix-network-videos` (already created)

2. **Storage Policies Applied:**
   Run the SQL in `migrations/add_orbix_network_storage_policies.sql` in Supabase SQL Editor

3. **Background Images Uploaded:**
   - Upload `Photo1.png` through `Photo12.png` to `orbix-network-backgrounds` bucket

## Post-Deployment Verification

1. **Backend Health:**
   ```bash
   curl https://your-backend-url.railway.app/health
   ```

2. **Test Orbix Network Setup:**
   - Login to dashboard
   - Navigate to Orbix Network module
   - Verify setup wizard loads

3. **Test Storage Upload:**
   - Complete setup wizard
   - Trigger a render job
   - Verify video uploads to Supabase Storage

4. **Monitor Logs:**
   - Check Railway logs for any errors
   - Verify scheduled jobs are running (scrape, process, render, publish)

## Troubleshooting

### If Supabase DNS Error Persists:
1. Verify Supabase project is active
2. Check network connectivity
3. Try pinging the Supabase URL directly
4. Verify `SUPABASE_URL` doesn't have trailing slash

### If Server Keeps Restarting:
- Make sure you're using `npm start` (not `npm run dev`) in production
- Check Railway logs for what's causing restarts
- Verify no infinite loops in scheduled jobs

### If Reviews Module Shows Error:
- The error is now handled gracefully - server will continue running
- Reviews module just won't be available until properly implemented
- This doesn't affect Orbix Network module




