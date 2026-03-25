# KiddConnect — split workspace (YouTube / studio vertical)

This folder **does not replace** the monorepo yet. It holds:

- **SQL** to introspect your live Supabase/Postgres schema (`docs/supabase-schema-introspection.sql`).
- **Manifests** (`manifest/`):
  - `DATABASE_TABLES.md` — studio tables from migrations
  - `CODE_PATHS.md` — routes/services to lift
  - `SERVER_MOUNT_ORDER.md` — Express mount order (callbacks vs auth)
  - `SHARED_CORE_PREREQUISITES.md` — `users` / `businesses` / `module_settings` etc.
  - `MIGRATION_FILES_ORDER.md` — how to think about SQL ordering for a new DB
  - `STORAGE_BUCKETS.md` — live Supabase storage bucket names, limits, MIME types

## Why nothing was deleted from the repo root

Dropping “everything else” and the **entire database** in one step would destroy Tavari production data, billing, users, and non-YouTube modules. The safe sequence is:

1. Run the introspection SQL and archive the results.
2. Decide **new** Supabase project (or new schema) for KiddConnect-only tables + **minimal** shared identity (or duplicate users with a migration).
3. Copy/move code into a **standalone** repo or promote this `KiddConnect/` tree to its own project with its own `package.json`, `server.js`, and `frontend/`.
4. Cut DNS and env only after dual-write or export/import is tested.

## Immediate next step

Open **Supabase → SQL Editor**, run `docs/supabase-schema-introspection.sql`, export results (CSV or save queries). Share the **section 7** output if you want the manifest tightened to your **actual** production tables.

## Branding on deploy

Vercel **KiddConnect** project should set `NEXT_PUBLIC_APP_DISPLAY_NAME=KiddConnect` (see `frontend/lib/appBrand.js` in the monorepo).
