# Backend connection: "Unable to connect to server"

When the frontend shows **"Unable to connect to server. Please check that the backend is running at https://api.tavarios.com"**, the browser cannot reach the API. Fix it by making sure the backend is up and reachable at that URL.

## 1. Test the backend directly

In a browser or terminal:

```bash
curl https://api.tavarios.com/health
```

- **If you get JSON** (e.g. `{"status":"ok",...}`): backend is up; the issue may be CORS, cookies, or the specific request. Check browser Network tab and backend CORS config.
- **If you get connection refused / timeout / DNS error**: backend is not reachable at `api.tavarios.com`. Continue below.

## 2. Check Railway

The backend is deployed to **Railway** (see `.github/workflows/deploy-backend.yml`).

1. Open [Railway Dashboard](https://railway.app) and select the project.
2. Open the **backend** service.
3. **Deployments**: ensure the latest deploy succeeded (not failed or stuck).
4. **Settings**:
   - **Root Directory**: `/` (project root).
   - **Start Command**: `npm start` or `node server.js`.
5. **Variables**: required env vars are set (e.g. `PORT`, `DATABASE_URL`, `NODE_ENV=production`). See `FIX_RAILWAY_DEPLOYMENT.md` for a full list.
6. If needed: **Redeploy** the latest deployment and wait a few minutes.

## 3. Custom domain `api.tavarios.com`

For the frontend to use `https://api.tavarios.com`, that hostname must point to your Railway service:

1. In Railway: backend service → **Settings** → **Networking** / **Domains**.
2. Add a **custom domain**: `api.tavarios.com`.
3. Railway will show the target (e.g. CNAME to a `*.railway.app` host). In your DNS provider (where `tavarios.com` is managed), add:
   - **Type**: CNAME  
   - **Name**: `api`  
   - **Value**: the target Railway gives (e.g. `xxx.railway.app`).
4. Wait for DNS to propagate (up to 48 hours, often minutes). Then test again:

   ```bash
   curl https://api.tavarios.com/health
   ```

If you don’t use a custom domain yet, Railway gives a default URL like `https://your-service.up.railway.app`. In that case:

- Test: `curl https://your-service.up.railway.app/health`
- Point the frontend at that URL by setting **Vercel** (or build) env **`NEXT_PUBLIC_API_URL`** to `https://your-service.up.railway.app`, then redeploy the frontend.

## 4. Trigger a backend deploy

Backend deploys run on push to `main` when backend paths change (e.g. `server.js`, `routes/`, `services/`). To redeploy without code changes:

- **Option A**: Railway Dashboard → backend service → Deployments → **Redeploy** on the latest deployment.
- **Option B**: Re-run the **Deploy Backend to Railway** workflow from the GitHub Actions tab (if you use that workflow).

After redeploy, test again:

```bash
curl https://api.tavarios.com/health
```

Once `/health` returns OK, the frontend should be able to connect to the backend at `https://api.tavarios.com`.
