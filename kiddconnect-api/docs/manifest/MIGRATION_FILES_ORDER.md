# SQL migrations — YouTube vertical (reference list)

**Do not run blindly on production.** Use for documentation and for building a **new** Supabase project. Core tenant/auth tables must exist first (`SHARED_CORE_PREREQUISITES.md`).

## Orbix Network (base → features)

1. `create_orbix_network_tables.sql` — sources, raw_items, stories, scripts, review_queue, renders, publishes, analytics_daily  
2. `add_orbix_network_module.sql` — module registration + related  
3. `add_orbix_network_storage_policies.sql` (and other storage policy files)  
4. `add_orbix_channels.sql` — `orbix_channels`  
5. Remaining `add_orbix_*.sql` / `add_*_channel_support.sql` / `add_orbix_longform_*.sql` / `add_orbix_deleted_riddles.sql` / etc. — **run in git chronological order** or use `ls migrations/add_orbix*` sorted by your deployment history  

Tip: `grep -l orbix migrations/*.sql` for a full file list.

## Kid Quiz

- `add_kidquiz_module.sql`  
- Any follow-ups matching `*kidquiz*`

## Dad Joke Studio

- `add_dad_joke_studio_module.sql`  
- `add_dad_joke_studio_asset_scope.sql`  
- `add_dad_joke_studio_storage_buckets.sql` (buckets + policies)

## Movie Review

- `add_movie_review_module.sql`  
- Follow-ups: `grep -l movie_review migrations/*.sql`

## Storage

Run bucket/policy migrations for `kidquiz-videos`, Orbix music/assets, `dadjoke-studio-*` as referenced in those SQL files.

## Reliable approach

On a **new** database, the lowest-risk path is often:

1. Run your **known-good full migration set** from a backup script used for Tavari staging, **or**  
2. Use **Supabase schema diff** / `pg_dump --schema-only` from staging after introspection SQL, then delete non–KiddConnect tables in a **new** project.

The introspection script in `docs/supabase-schema-introspection.sql` is the source of truth for what production actually has.
