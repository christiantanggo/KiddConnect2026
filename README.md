# Le Fournier (lefournier.ca)

Studio dashboard for YouTube content modules: Orbix Network, Kid Quiz, Dad Joke Studio, and Movie Review.

| Folder | What it is | Hosted on |
|--------|------------|-----------|
| `kiddconnect-web/` | Next.js site — www.lefournier.ca | Vercel (project `kidd-connect`) |
| `kiddconnect-api/` | Express API | Railway (project `Kidd-Connect`, service `KiddConnect2026`) |

## Deploy

- **API:** pushing changes under `kiddconnect-api/` to `main` runs `.github/workflows/deploy-kiddconnect-api.yml`.
- **Web:** `cd kiddconnect-web && npx vercel --prod`. The GitHub workflow `deploy-kiddconnect-web.yml` needs the `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` repo secrets before it can deploy on push.

Bump `DEPLOYMENT_LABEL` in `kiddconnect-web/components/DeploymentBar.jsx` and `DEPLOYMENT_VERSION` in `kiddconnect-api/server.js` when you ship.

## Database

- `kiddconnect-api/migrations/` — full SQL migration history for the live Supabase database (includes the shared core tables from the original Tavari platform).
- `kiddconnect-api/docs/` — notes on which tables, buckets, and migrations the studio modules depend on.
- `kiddconnect-api/supabase/functions/mail-send/` — Supabase Edge Function used for outgoing email (Contact Us form). Deploy with `supabase functions deploy mail-send`.
