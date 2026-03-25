# Dev ports setup — guide for agents (other repositories)

Copy this pattern into **any** Node + Next.js monorepo so local **backend** and **frontend** ports are fixed per project and documented in one place.

**Reference implementation:** this repo (`KiddConnect Youtube` / Tavari) uses backend **5000** and frontend **3000** via `config/dev-ports.json`. Other projects should pick **different** numbers if they may run at the same time.

---

## Rules

1. **One source of truth:** `config/dev-ports.json` at the **repository root** (not inside `frontend/`).
2. **Production:** backend must use `process.env.PORT` (Railway, etc.). Never hardcode production port in code.
3. **Local:** backend uses `PORT` if set, otherwise the `backend` value from the JSON.
4. **No duplicate magic numbers:** scripts and fallbacks should read the JSON or match its defaults.

---

## Step 1 — Pick ports for this repo

Choose a **backend** + **frontend** pair. While another app is running, **do not** reuse its ports.

| Example role   | Backend | Frontend |
|----------------|---------|----------|
| Reference app (this repo) | 5000 | 3000 |
| Second project | 5002 | 3001 |
| Third project  | 5003 | 3002 |

**Mac:** Port **5000** is sometimes used by AirPlay Receiver. If the backend fails to bind, use e.g. **5001** for `backend` in JSON and keep frontend at **3000** (or another free port).

---

## Step 2 — Create `config/dev-ports.json`

At repo root:

```json
{
  "project": "Human-readable project name",
  "backend": 5002,
  "frontend": 3001
}
```

Use valid JSON only. All port changes for local dev go **here**.

---

## Step 3 — Wire the backend (`server.js` or entry file)

After `dotenv.config()`:

1. Resolve path to `config/dev-ports.json` next to the server file (ESM: `import.meta.url` + `fileURLToPath` + `path.dirname`).
2. `readFileSync` + `JSON.parse`; on failure, use an inline fallback object with the **same** `backend` / `frontend` as your JSON.
3. `const port = Number(process.env.PORT) || Number(devPorts.backend) || <fallbackBackend>;`
4. `app.listen(port, '0.0.0.0', …)` (or your host).

---

## Step 4 — Wire Next.js `frontend/next.config.js`

1. `require('path')`, `require('fs')`.
2. Read `path.join(__dirname, '..', 'config', 'dev-ports.json')` and parse; catch errors and use the same numeric fallbacks as `backend` in your JSON.
3. `const isProd = process.env.NODE_ENV === 'production';`
4. `env.NEXT_PUBLIC_API_URL`:
   - If `process.env.NEXT_PUBLIC_API_URL` is set → use it.
   - Else if `isProd` → production API URL (e.g. `https://api.example.com`).
   - Else → `` `http://localhost:${backendFromJson}` ``.

---

## Step 5 — Pin Next dev port `frontend/package.json`

```json
"dev": "next dev -p <frontend>"
```

`<frontend>` must equal `"frontend"` in `dev-ports.json`.

---

## Step 6 — Optional PowerShell (repo root)

**`start-dev.ps1`**

- `Join-Path $PSScriptRoot "config\dev-ports.json"`
- `ConvertFrom-Json`; set `$port = [int]$ports.backend` with a script default matching your JSON if the file is missing.
- Kill process on `$port`, then start the backend (e.g. `node --watch server.js`).

**`kill-port.ps1`**

- Same JSON read; kill that `backend` port.

**`scripts/restart-server.ps1`** (if present)

- Point at `..\config\dev-ports.json` from `scripts/` and use `backend` for the port to free.

---

## Step 7 — CORS and OAuth / webhooks

- Backend **allowed origins** for local dev must include `http://localhost:<frontend>` (and `http://127.0.0.1:<frontend>` if you use it).
- Any hardcoded local URLs (OAuth redirect, webhooks, test scripts) should use `http://localhost:<backend>` **or** read from env; align defaults with `dev-ports.json`.

---

## Step 8 — Document in the target repo

Add a short **`PORTS.md`** at repo root:

- Table: Backend / Frontend / one-line note.
- Link to `config/dev-ports.json` as source of truth.
- Optional: “See `docs/DEV_PORTS_AGENT_GUIDE.md` in the reference repo for the full pattern.”

---

## Checklist (before closing the task)

- [ ] `config/dev-ports.json` exists with `project`, `backend`, `frontend`
- [ ] Backend listens on `PORT` in production; JSON `backend` locally
- [ ] `frontend/next.config.js` sets dev/prod `NEXT_PUBLIC_API_URL` as above
- [ ] `npm run dev` in `frontend` uses `-p <frontend>`
- [ ] PowerShell helpers (if any) read `backend` from JSON
- [ ] CORS + local OAuth/webhook defaults match the chosen backend port
- [ ] `PORTS.md` updated for that repo

---

## Paste-friendly one-liner for a chat

> Apply `docs/DEV_PORTS_AGENT_GUIDE.md` from the Tavari/KiddConnect repo: add `config/dev-ports.json` with backend **XXXX** and frontend **YYYY**, wire server + `frontend/next.config.js` + `next dev -p YYYY`, optional PowerShell, CORS, and `PORTS.md`.

Replace **XXXX** / **YYYY** with that project’s chosen ports.
