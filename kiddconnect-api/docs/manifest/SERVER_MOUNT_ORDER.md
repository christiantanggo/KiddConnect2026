# Express mount order — KiddConnect API surface

Mirrors `server.js` (public callbacks **before** authenticated routers). For a split backend, mount only these (plus health, auth, and shared middleware).

## Public (no JWT) — OAuth redirects

| Mount path | File |
|------------|------|
| `/api/v2/orbix-network` (callback routes) | `routes/v2/orbix-network-youtube-callback.js` |
| `/api/v2/riddle/...` or as wired | `routes/v2/riddle-youtube-callback.js` |
| `/api/v2/kidquiz` | `routes/v2/kidquiz-youtube-callback.js` |
| `/api/v2/dad-joke-studio` | `routes/v2/dad-joke-studio-youtube-callback.js` |

Order in monolith: Orbix YouTube callback → Riddle callback → Orbix setup → main Orbix router; Kid Quiz and Dad Joke callbacks before their authenticated routers. **Copy the exact order from `server.js`** when you fork.

## Authenticated (`authenticate` + `requireBusinessContext`)

| Mount path | File |
|------------|------|
| `/api/v2/orbix-network/longform` | `routes/v2/orbix-network-longform.js` |
| `/api/v2/orbix-network/jobs` | `routes/v2/orbix-network-jobs.js` |
| `/api/v2/orbix-network` (setup) | `routes/v2/orbix-network-setup.js` |
| `/api/v2/orbix-network` | `routes/v2/orbix-network.js` |
| `/api/v2/kidquiz` | `routes/v2/kidquiz.js` |
| `/api/v2/dad-joke-studio` | `routes/v2/dad-joke-studio.js` |
| `/api/v2/movie-review` | `routes/v2/movie-review.js` |

## Background jobs

- `server.js` imports intervals from `routes/v2/orbix-network-jobs.js` for pending renders / uploads — required for Orbix automation unless you move to a worker process.

## Supporting packages (from monolith `package.json`)

`googleapis`, `@supabase/supabase-js`, `axios`, `openai`, `multer`, `express`, `dotenv`, `ffmpeg` (system / Nixpacks), etc. — trim after you know each route’s imports.
