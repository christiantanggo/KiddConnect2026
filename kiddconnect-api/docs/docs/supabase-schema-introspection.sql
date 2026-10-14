-- =============================================================================
-- Supabase / Postgres — full schema introspection (run in SQL Editor)
-- Use this to see every table, column, FK, index, and RLS policy before split.
-- =============================================================================

-- ─── 1) Every base table in public (name, owner, approx row count) ─────────
SELECT
  c.relname AS table_name,
  pg_catalog.pg_get_userbyid(c.relowner) AS owner,
  c.reltuples::bigint AS estimated_row_count,
  pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relname;

-- ─── 2) Every column (public + auth) — uncomment auth if you need it ─────────
SELECT
  table_schema,
  table_name,
  ordinal_position,
  column_name,
  data_type,
  udt_name,
  character_maximum_length,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema IN ('public')
ORDER BY table_schema, table_name, ordinal_position;

-- Optional: include Supabase Auth tables (users, sessions, etc.)
-- AND table_schema = 'auth'

-- ─── 3) Primary keys & unique constraints ───────────────────────────────────
SELECT
  tc.table_schema,
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_schema = kcu.table_schema
 AND tc.table_name = kcu.table_name
WHERE tc.table_schema = 'public'
  AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
ORDER BY tc.table_name, tc.constraint_type, kcu.ordinal_position;

-- ─── 4) Foreign keys (graph of dependencies for migration order) ───────────
SELECT
  tc.table_schema AS from_schema,
  tc.table_name AS from_table,
  kcu.column_name AS from_column,
  ccu.table_schema AS to_schema,
  ccu.table_name AS to_table,
  ccu.column_name AS to_column,
  tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name;

-- ─── 5) Indexes (non-PK) ─────────────────────────────────────────────────────
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- ─── 6) RLS enabled + policies (Supabase) ───────────────────────────────────
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relname;

SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ─── 7) Tables likely part of YouTube / studio vertical (filter) ────────────
-- Adjust patterns as you refine the product split.
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
  AND (
    table_name LIKE 'kidquiz%'
    OR table_name LIKE 'dadjoke%'
    OR table_name LIKE 'orbix%'
    OR table_name LIKE 'movie_review%'
  )
ORDER BY table_name;

-- ─── 8) Storage buckets (if using storage.objects metadata) ────────────────
-- Run in Supabase: Table editor → storage.buckets, or:
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
ORDER BY name;
