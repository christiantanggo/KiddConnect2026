# EMERGENCY: Fix "Unable to connect to server" (Live site down)

Your frontend is trying to reach **https://api.tavarios.com** and it’s not reachable. Do one of the following.

---

## Option 1: Point frontend to your Railway backend (fastest)

Your backend is on **Railway**. Use its public URL for the app.

1. **Get the backend URL**
   - Go to [railway.app](https://railway.app) → your project → **backend** service.
   - Open **Settings** → **Networking** (or **Deployments**).
   - Copy the **public URL** (e.g. `https://tavari-production.up.railway.app` or `https://xxx.up.railway.app`).
   - In a browser, open `https://YOUR-RAILWAY-URL/health` and confirm you see JSON (e.g. `{"status":"ok",...}`).

2. **Set it in Vercel**
   - Go to [vercel.com](https://vercel.com) → your **frontend** project (e.g. tavari-communications-agent).
   - **Settings** → **Environment Variables**.
   - Add or edit:
     - **Name:** `NEXT_PUBLIC_API_URL`
     - **Value:** your Railway URL, e.g. `https://tavari-production.up.railway.app` (no trailing slash).
     - **Environment:** Production (and Preview if you want).
   - Save.

3. **Redeploy**
   - **Deployments** → open the **...** on the latest deployment → **Redeploy**.
   - Wait for the build to finish.

The live site will then call your Railway backend. No DNS change needed.

---

## Option 2: Fix api.tavarios.com (if you want that domain)

1. **Railway**
   - Backend service → **Settings** → **Networking** / **Domains**.
   - Add custom domain: `api.tavarios.com`.
   - Copy the CNAME target Railway shows.

2. **DNS (where tavarios.com is managed)**
   - Add a **CNAME** record:
     - **Name:** `api`
     - **Target:** the Railway CNAME (e.g. `xxx.up.railway.app`).
   - Wait for DNS to propagate (often 5–60 minutes).

3. **Vercel**
   - Keep `NEXT_PUBLIC_API_URL` = `https://api.tavarios.com` (or set it if you changed it for Option 1).
   - Redeploy so the frontend uses that URL.

---

## Runtime override (no redeploy)

If you can inject a script on the live site (e.g. in Vercel or your HTML), set this **before** the app loads:

```html
<script>window.__TAVARI_API_URL__ = 'https://YOUR-RAILWAY-URL';</script>
```

Replace `YOUR-RAILWAY-URL` with your real backend URL (e.g. `https://tavari-production.up.railway.app`). The app will use that URL for API calls without a new deploy.

---

## Check

- Backend: open `https://YOUR-BACKEND-URL/health` in a browser → should return JSON.
- Frontend: after redeploy or runtime override, reload the site; the connection error should stop.
