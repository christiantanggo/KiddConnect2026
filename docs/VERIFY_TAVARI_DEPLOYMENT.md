# Deploy to **tavarios.com** (not KiddConnect)

Pushing this repo updates **whatever** Vercel and Railway projects are linked to **this GitHub repository**. Domains are **not** chosen by the code—they are set in each platform.

## 1. Confirm the GitHub repo

- This project should push to **your Tavari repo** (e.g. `christiantanggo/Tavari-Communications-Agent`).
- If **KiddConnect** is a **separate** GitHub repo, pushes **here** do **not** deploy KiddConnect unless you pointed both platforms at the same repo (avoid that).

## 2. Vercel → **tavarios.com**

1. [Vercel Dashboard](https://vercel.com) → select the project that should serve **tavarios.com**.
2. **Settings → Git** → confirm it is connected to **this** repository and branch (usually `main`).
3. **Settings → Domains** → **tavarios.com** / **www.tavarios.com** must be assigned to **this** project (not a KiddConnect project).
4. If you use **GitHub Actions** (`deploy-frontend.yml`), **Settings → Secrets → Actions**:
   - `VERCEL_PROJECT_ID` / `VERCEL_ORG_ID` must be from **this** Vercel project (open project → Settings → General → IDs).
5. **`NEXT_PUBLIC_API_URL`** (secret or Vercel env) should be **`https://api.tavarios.com`** (your Tavari API), not a KiddConnect API host.

## 3. Railway → **api.tavarios.com**

1. [Railway](https://railway.app) → service that backs **api.tavarios.com**.
2. Confirm **GitHub** integration is tied to **this** repo (or you only deploy via Action with the correct token).
3. **Settings → Networking / Custom domain** → **api.tavarios.com** on **this** service.
4. Env: `FRONTEND_URL` / CORS should allow **https://tavarios.com** (see `server.js` allowlist).

## 4. After push

- **Vercel:** Deployment tab → confirm production URL / domain is **tavarios.com**.
- **Railway:** Latest deploy → logs show healthy; hit `https://api.tavarios.com/health`.

## 5. GitHub Action service name

`.github/workflows/deploy-backend.yml` runs `railway up --service backend`. Your Railway service must be named **`backend`**, or change that line to match your Tavari service name.

---

**Summary:** Same codebase can deploy to Tavari or KiddConnect only if you use **two separate** Vercel projects + **two separate** Railway services (or two repos). For **tavarios.com**, every ID and domain in Vercel/Railway/GitHub secrets must belong to the **Tavari** stack.
