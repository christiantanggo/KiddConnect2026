# Shared database – do not break the existing app

**This codebase was copied from another project. It uses the SAME database (same Supabase project) as the original project that is currently running in production.**

Anything that changes or deletes data in that database can break the running app. Follow these rules.

---

## Rules

1. **Do not run migrations or SQL scripts without explicit approval.**  
   Do not run `npm run migrate`, `npm run migrate:legacy-users`, or any `.sql` file in this repo unless you have verified the SQL and confirmed it is safe for the **existing** app and the shared DB.

2. **Never run destructive migrations against the shared DB.**  
   Do **not** run any script or SQL that:
   - Drops tables or columns the other app uses
   - Truncates or bulk-deletes data (e.g. `DELETE FROM …` without a narrow `WHERE`)
   - Renames or changes columns in a way the other app doesn’t expect

3. **Connection = same DB.**  
   This app connects via `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `config/database.js`. If this deployment uses the same env vars as the other project, it is the same database. Changing data here affects the other app.

4. **Additive changes only, with care.**  
   If you must add tables or columns (e.g. `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN`), ensure the old app does not rely on the absence of those objects and that the new schema is compatible with both codebases.

---

## Known dangerous file

- **`migrations/clear_orbix_network_data.sql`** – Deletes all Orbix-related data (`orbix_publishes`, `orbix_renders`, `orbix_stories`, etc.). **Do not run this on the shared database** unless you intend to wipe that data for both apps.

---

## For AI / agents

When editing this repo:

- Do **not** suggest or run `npm run migrate` or any migration script unless the user has explicitly asked to run a specific, reviewed migration.
- Do **not** suggest or run any SQL that drops tables, truncates tables, or bulk-deletes data.
- Do **not** change `config/database.js` in a way that would point at a different database without the user explicitly asking.
- Assume the same DB is used by another running application; any schema or data change can affect it.
