# Tavari vs KiddConnect — separate products

| Product | API | Web |
|--------|-----|-----|
| **KiddConnect** | `kiddconnect-api/` → Railway | `kiddconnect-web/` → Vercel |
| **Tavari** | repo root `server.js` | `frontend/` |

## New GitHub repo for KiddConnect only

1. Create an **empty** GitHub repo under your account (e.g. `christiantanggo/KiddConnect2026`) — no README.
2. From the **Tavari monorepo** root, use **PowerShell** (Command Prompt does not run `.ps1` by itself):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\push-kiddconnect-new-github-repo.ps1 -RepoUrl https://github.com/christiantanggo/KiddConnect2026.git
```

Or from **cmd.exe**:

```text
scripts\push-kiddconnect-repo.cmd https://github.com/christiantanggo/KiddConnect2026.git
```

This copies `kiddconnect-api/`, `kiddconnect-web/`, and `KiddConnect/` into a temp folder (excludes `node_modules` and `.env`), `git init`, and pushes `main`. Your monorepo is not switched to an orphan branch.

If GitHub already created `main` (README/license), add **`-Force`** to overwrite:  
`.\scripts\push-kiddconnect-new-github-repo.ps1 -RepoUrl https://github.com/christiantanggo/KiddConnect2026.git -Force`

3. **Railway:** deploy that repo, **Root Directory** `kiddconnect-api`, `npm start`, set env vars.
4. **Vercel:** same repo, **Root Directory** `kiddconnect-web`.

## Railway (API)

- Root Directory: `kiddconnect-api`
- Start: `npm start`
- Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BACKEND_URL`, `FRONTEND_URL`, etc.

## Vercel (web)

- Root Directory: `kiddconnect-web`
- `NEXT_PUBLIC_API_URL` = your Railway API URL

## Drift

Changes may need to be applied in both the monorepo and the KiddConnect repo until you automate sync.
