# Deploy to Vercel (frontend) and Railway (backend)

## For agents (quick reference)

**One-line summary:** Deploy by staging the right files, committing, and running `git push origin main` from the repo root; the existing GitHub Actions deploy backend to Railway and frontend to Vercel.

**Steps:**

1. From the **repo root** (use `working_directory` to the project root; do not use `git -C` from elsewhere):
   - `git add <files to deploy>` (only app code; do not add `.github/workflows` unless the token has `workflow` scope)
   - `git commit -m "your message"`
   - `git push origin main`
2. **Backend:** The push triggers the "Deploy Backend to Railway" workflow when `server.js`, `routes/**`, `services/**`, etc. change. No extra command.
3. **Frontend:** Either rely on the "Deploy Frontend to Vercel" workflow (runs on push to main), or run from repo root: `cd frontend; npx vercel --prod` (with `working_directory` set to the project root).

---

The app deploys in two places:

| Part | Host | Trigger |
|------|------|--------|
| **Frontend** (Next.js in `frontend/`) | **Vercel** | Push to `main` when `frontend/**` changes, or run workflow "Deploy Frontend to Vercel" |
| **Backend** (Express in repo root) | **Railway** | Push to `main` when backend paths change, or run workflow "Deploy Backend to Railway" |

---

Before you rely on production URLs, read **[docs/VERIFY_TAVARI_DEPLOYMENT.md](docs/VERIFY_TAVARI_DEPLOYMENT.md)** so **tavarios.com** / **api.tavarios.com** are tied to this repo’s Vercel + Railway projects (not a KiddConnect stack).

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
- `NEXT_PUBLIC_API_URL` (optional) — backend URL used at build time (local default comes from `config/dev-ports.json` + `frontend/next.config.js`; production should set this to `https://api.tavarios.com` or your Railway URL). See [`PORTS.md`](PORTS.md).

### Railway (backend)

1. [railway.app](https://railway.app) → New Project → Deploy from GitHub repo.
2. Select this repo. Railway will use `nixpacks.toml` and `package.json` (build: `npm ci`, start: `npm start` → `start.js` → `server.js`).
3. In the Railway service (name it **Tavari-Communications-Agent** to match the GitHub Action), add your env vars (e.g. `DATABASE_URL`, `VAPI_API_KEY`, `BACKEND_URL` or `RAILWAY_PUBLIC_DOMAIN`, etc.).
4. **Health check (required for "Application failed to respond"):** In the service → **Settings** → set **Health Check Path** to `/health` (path only; the app listens on `PORT` and exposes `GET /health`). Optionally set env `RAILWAY_HEALTHCHECK_TIMEOUT_SEC=300` if startup is slow.
5. Deploy. Railway will auto-deploy on push if connected to GitHub.

**Dashboard module layout:** Under **Archive** in the UI: only YouTube studio modules (`kidquiz`, `movie-review`, `orbix-network`). Everything else uses the main marketplace. Edit `frontend/lib/archived-module-keys.js` if that list changes.

**If using the GitHub Action** (`.github/workflows/deploy-backend.yml`):

- Add repo secret: `RAILWAY_TOKEN` — from Railway → Account → Tokens (or project settings).
- The workflow runs `railway up --service "Tavari-Communications-Agent"`, so the Railway project must have a service named **Tavari-Communications-Agent**.

---

## Deploying

- **Automatic:** Push to `main`. Frontend workflow runs when `frontend/**` (or `vercel.json`) changes; backend workflow runs when `server.js`, `routes/**`, `services/**`, etc. change.
- **Manual:** GitHub → Actions → "Deploy Frontend to Vercel" or "Deploy Backend to Railway" → Run workflow.

After deploy, the frontend on Vercel will call the backend using `NEXT_PUBLIC_API_URL`. Set `BACKEND_URL` or `RAILWAY_PUBLIC_DOMAIN` on Railway so webhooks (e.g. VAPI) use the correct public URL.
