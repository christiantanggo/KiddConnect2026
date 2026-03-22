# CORRECT DEPLOYMENT COMMAND

## Tavari frontend (manual CLI)

Deploy **from the `frontend` directory** so Next.js is detected.

```bash
# From project root:
cd frontend

# Link to your Vercel project (once)
npx vercel link --yes

# Deploy to production
npx vercel --prod --yes
```

## GitHub Action (Deploy Frontend to Vercel)

The workflow deploys from `working-directory: ./frontend` and uses repo secrets. In GitHub → Settings → Secrets and variables → Actions set:

- `VERCEL_TOKEN` — from [vercel.com/account/tokens](https://vercel.com/account/tokens)
- `VERCEL_ORG_ID` — from your Vercel team → project → Settings → General
- `VERCEL_PROJECT_ID` — same page
- `NEXT_PUBLIC_API_URL` — your backend URL (e.g. `https://api.tavarios.com` or your Railway URL)

If the Action deploys to the wrong project, the secrets point at a different Vercel project; update them to match the project that serves **tavarios.com**.

## IMPORTANT: Vercel Dashboard Settings

**Project Settings → General → Root Directory** can be `frontend` if you deploy from repo root via Git; if you deploy via CLI from `frontend/`, the uploaded root is already the app. Build should show "Route (app)" and many routes, not 2.
