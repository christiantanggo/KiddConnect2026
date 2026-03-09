# CORRECT DEPLOYMENT COMMAND

## For tavarios.com deployment (manual CLI):

Deploy **from the `frontend` directory** so Next.js is detected. The project is `tavari-communications-agent`.

```bash
# From project root:
cd C:\Apps\Tavari-Communications-App\frontend

# Link to correct project (once)
npx vercel link --project tavari-communications-agent --yes

# Deploy to production
npx vercel --prod --yes
```

## GitHub Action (Deploy Frontend to Vercel)

The workflow deploys from `working-directory: ./frontend` and uses repo secrets. **To deploy to this project**, in GitHub → Settings → Secrets and variables → Actions set:

- `VERCEL_TOKEN` — from [vercel.com/account/tokens](https://vercel.com/account/tokens)
- `VERCEL_ORG_ID` — from Vercel project **tavari-communications-agent** → Settings → General
- `VERCEL_PROJECT_ID` — same page

If the Action deploys to the wrong project, the secrets are for a different Vercel project; update them to the IDs for `tavari-communications-agent` (e.g. under christian-fourniers-projects).

## IMPORTANT: Vercel Dashboard Settings

**Project Settings → General → Root Directory** can be `frontend` if you deploy from repo root via Git; if you deploy via CLI from `frontend/`, the uploaded root is already the app. Build should show "Route (app)" and 104 routes, not 2.

