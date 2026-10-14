# Code paths — YouTube / studio vertical (current monorepo)

Use this as a **checklist** when extracting into a standalone KiddConnect app.  
Paths are relative to repo root `KiddConnect Youtube/`.

## Backend (Express)
- `routes/v2/kidquiz.js`, `routes/v2/kidquiz-youtube-callback.js`
- `routes/v2/dad-joke-studio.js`, `routes/v2/dad-joke-studio-youtube-callback.js`
- `routes/v2/orbix-network.js` (very large)
- `routes/v2/orbix-network-youtube-callback.js`
- `routes/v2/orbix-network-longform.js`
- `routes/v2/orbix-network-jobs.js` (render/upload intervals — check `server.js`)
- `routes/v2/orbix-network-setup.js`
- `routes/v2/movie-review.js`
- `routes/v2/riddle-youtube-callback.js` (Orbix custom OAuth channel)
- `services/kidquiz/`
- `services/dadjoke-studio/`
- `services/orbix-network/` (entire directory: renderers, publishers, scrapers, generators, longform, …)
- `services/movie-review/` (`publisher.js`, `renderer.js`)
- `server.js` — mount order: see `SERVER_MOUNT_ORDER.md`; CORS for `kiddconnect.ca` + `FRONTEND_URL`

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
- Search: `grep -r "orbix-network-jobs" scripts/ server.js`

## Config / env
- YouTube OAuth redirect URIs per module (`YOUTUBE_REDIRECT_URI`, per-callback URLs)
- `ModuleSettings` model usage for `kidquiz`, `orbix-network`, etc.
