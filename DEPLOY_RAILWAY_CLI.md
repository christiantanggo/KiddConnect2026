# Deploy to Railway via CLI

**Canonical guide for agents:** See **`docs/RAILWAY_DEPLOY_FROM_AGENT.md`** — it explains why `railway up` often times out from the agent environment (network, not code) and what to do instead. **Do not keep retrying `railway up` from the agent.**

---

Use this when you need to deploy the app to Railway using the CLI.

## Context

- The repo is a Node.js monorepo (root server + `frontend/`). Railway has a ~40–45 MB upload limit for `railway up`.
- `.gitignore` and `.railwayignore` are already set so `frontend/node_modules/`, `frontend/.next/`, and `archive/` are excluded. The upload tarball should be ~31 MB.

## What to do

1. From the **repo root**, run:
   ```bash
   railway up --service "Tavari-Communications-Agent" -d
   ```
2. If the command **times out** ("operation timed out") while uploading: **stop retrying from this environment.** See `docs/RAILWAY_DEPLOY_FROM_AGENT.md`. Then:
   - Commit and push any pending changes (so the code is on GitHub), and tell the user to deploy via Railway dashboard (Redeploy / Deploy from main) or to run the same `railway up` command on their own machine.
3. If `railway` is **not linked**, the user may need to run `railway link` first (select project/environment).

## Do not

- Add `node_modules`, `frontend/node_modules`, or `frontend/.next` to the repo; they must stay in `.gitignore` / `.railwayignore`.
- Remove or relax the existing ignore rules that keep the upload under ~40 MB.
