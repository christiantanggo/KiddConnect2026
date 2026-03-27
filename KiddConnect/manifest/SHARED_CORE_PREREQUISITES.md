# Shared core — required before YouTube modules work

The studio routes use **v2 auth** and **business context** (`X-Active-Business-Id`, JWT). They expect Supabase rows that the monolith created via core migrations.

## Minimum tables (typical)

- `users` — auth user records (often created by your signup flow / legacy migrations)
- `businesses` — tenant / organization
- `organization_users` — links user ↔ business with role (`owner` / `admin` / `staff`)
- `modules` — registry rows for `kidquiz`, `orbix-network`, `movie-review`, `dad-joke-studio`, etc.
- `module_settings` — per-business JSON (YouTube OAuth tokens, module config)
- Often: `business_modules` or subscription tables if middleware checks entitlements

Exact definitions live in `migrations/create_v2_tables.sql` and earlier user/business migrations.

## For a **KiddConnect-only** new database

You either:

1. **Run the full Tavari core migration chain** up to `create_v2_tables.sql` (plus anything `module_settings` depends on), **then** only expose KiddConnect UI/routes, or  
2. **Author a slim “tenant + auth stub” migration** that creates minimal `users` / `businesses` / `organization_users` / `module_settings` / `modules` compatible with existing `authenticate` + `requireBusinessContext` code, then add studio tables.

Option 2 is less code to delete later but more design work.

## Auth / API

- `middleware/auth.js` + `middleware/v2/requireBusinessContext.js`
- `config/database.js` (Supabase client)
- `models/v2/ModuleSettings.js` (and any model imported by studio routes)

See `SERVER_MOUNT_ORDER.md` in this folder.
