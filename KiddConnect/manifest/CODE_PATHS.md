# Code paths — YouTube / studio vertical (current monorepo)

Use this as a **checklist** when extracting into a standalone KiddConnect app.  
Paths are relative to repo root `KiddConnect Youtube/`.

## Backend (Express)
- `routes/v2/kidquiz.js`, `routes/v2/kidquiz-youtube-callback.js`
- `routes/v2/dad-joke-studio.js`, `routes/v2/dad-joke-studio-youtube-callback.js`
- `routes/v2/orbix-network.js` (very large), `routes/v2/orbix-network-youtube-callback.js`
- `routes/v2/movie-review.js` (+ any movie-review callback if present)
- `routes/v2/riddle-youtube-callback.js` (Orbix custom OAuth channel)
- `services/kidquiz/`
- `services/dadjoke-studio/`
- `services/orbix-network/` (renderers, publisher, scrapers, workers)
- `services/movie-review/` (if present as folder)
- `server.js` — mount only the routes you keep; CORS allowlist for `kiddconnect.ca`

## Frontend (Next.js)
- `frontend/app/dashboard/v2/modules/kidquiz/**`
- `frontend/app/dashboard/v2/modules/dad-joke-studio/**`
- `frontend/app/dashboard/v2/modules/orbix-network/**`
- `frontend/app/dashboard/v2/modules/movie-review/**`
- `frontend/app/modules/dad-joke-studio/**`, `frontend/app/modules/orbix-network/**`
- `frontend/lib/moduleRoutes.js` (if used for KiddConnect routing)
- Shared: `AuthGuard`, `V2AppShell`, `V2Sidebar` (trim nav for KiddConnect-only), `lib/api.js`, `lib/appBrand.js`

## Migrations
- All `migrations/*kidquiz*`, `*dadjoke*`, `*orbix*`, `*movie_review*`, `*riddle*`, channel support, storage policies for those buckets

## Workers / scripts
- `scripts/orbix-render-worker.js` (and any cron/worker that processes Orbix/KidQuiz/DadJoke renders)

## Config / env
- YouTube OAuth redirect URIs per module (`YOUTUBE_REDIRECT_URI`, per-callback URLs)
- `ModuleSettings` model usage for `kidquiz`, `orbix-network`, etc.
