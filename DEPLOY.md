# Deploy to Vercel (frontend) and Railway (backend)

The app deploys in two places:

| Part | Host | Trigger |
|------|------|--------|
| **Frontend** (Next.js in `frontend/`) | **Vercel** | Push to `main` when `frontend/**` changes, or run workflow "Deploy Frontend to Vercel" |
| **Backend** (Express in repo root) | **Railway** | Push to `main` when backend paths change, or run workflow "Deploy Backend to Railway" |

---

## One-time setup

### Vercel (frontend)

1. [vercel.com](https://vercel.com) → Add New Project → Import this repo.
2. Set **Root Directory** to `frontend`.
3. Add env var: `NEXT_PUBLIC_API_URL` = your backend URL (e.g. Railway URL or `https://api.tavarios.com`).
4. Deploy. Vercel will auto-deploy on push to `main` if the project is connected to GitHub.

**If using the GitHub Action** (`.github/workflows/deploy-frontend.yml`), add repo secrets:

- `VERCEL_TOKEN` — [vercel.com/account/tokens](https://vercel.com/account/tokens)
- `VERCEL_ORG_ID` — Vercel project → Settings → General
- `VERCEL_PROJECT_ID` — same page
- `NEXT_PUBLIC_API_URL` (optional) — backend URL used at build time (defaults to `https://api.tavarios.com`)

### Railway (backend)

1. [railway.app](https://railway.app) → New Project → Deploy from GitHub repo.
2. Select this repo. Railway will use `railway.json` and `package.json` (build: `npm ci`, start: `npm start` → `start.js` → `server.js`).
3. In the Railway service (name it **backend** if you use the GitHub Action), add your env vars (e.g. `DATABASE_URL`, `VAPI_API_KEY`, `BACKEND_URL` or `RAILWAY_PUBLIC_DOMAIN`, etc.).
4. Deploy. Railway will auto-deploy on push if connected to GitHub.

**If using the GitHub Action** (`.github/workflows/deploy-backend.yml`):

- Add repo secret: `RAILWAY_TOKEN` — from Railway → Account → Tokens (or project settings).
- The workflow runs `railway up --service backend`, so the Railway project must have a service named **backend**.

---

## Deploying

- **Automatic:** Push to `main`. Frontend workflow runs when `frontend/**` (or `vercel.json`) changes; backend workflow runs when `server.js`, `routes/**`, `services/**`, etc. change.
- **Manual:** GitHub → Actions → "Deploy Frontend to Vercel" or "Deploy Backend to Railway" → Run workflow.

After deploy, the frontend on Vercel will call the backend using `NEXT_PUBLIC_API_URL`. Set `BACKEND_URL` or `RAILWAY_PUBLIC_DOMAIN` on Railway so webhooks (e.g. VAPI) use the correct public URL.
