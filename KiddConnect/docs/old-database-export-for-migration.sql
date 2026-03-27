-- =============================================================================
-- OLD DATABASE — export for migration / new Supabase planning
-- Run against the SOURCE (old) project: Supabase → SQL Editor.
--
-- OPTION A (recommended): run the SINGLE query in section "A" below.
--   Result: two columns — `section` (group name) and `payload` (JSON per row).
--   Download as one CSV, or copy the whole grid.
--
-- If the query times out or errors (very large DB), use OPTION B (separate
-- queries at the bottom of this file).
--
-- After you save the full Option A result as JSON, generate CREATE TABLE SQL:
--   node KiddConnect/scripts/generate-ddl-from-supabase-audit.cjs export.json > public-ddl.sql
-- (Run from repo root; requires Node.js. Re-run Option A after git pull so FK
-- rows include from_ordinal.)
-- =============================================================================


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  OPTION A — ONE QUERY (entire script below this line = one run)            ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

SELECT '01_tables' AS section,
  jsonb_build_object(
    'table_name', c.relname,
    'owner', pg_catalog.pg_get_userbyid(c.relowner),
    'estimated_row_count', c.reltuples::bigint,
    'total_size', pg_size_pretty(pg_total_relation_size(c.oid))
  ) AS payload
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'

UNION ALL
SELECT '02_columns',
  jsonb_build_object(
    'table_schema', c.table_schema,
    'table_name', c.table_name,
    'ordinal_position', c.ordinal_position,
    'column_name', c.column_name,
    'data_type', c.data_type,
    'udt_name', c.udt_name,
    'character_maximum_length', c.character_maximum_length,
    'numeric_precision', c.numeric_precision,
    'numeric_scale', c.numeric_scale,
    'is_nullable', c.is_nullable,
    'column_default', c.column_default
  )
FROM information_schema.columns c
WHERE c.table_schema = 'public'

UNION ALL
SELECT '03_pk_unique',
  jsonb_build_object(
    'table_schema', tc.table_schema,
    'table_name', tc.table_name,
    'constraint_name', tc.constraint_name,
    'constraint_type', tc.constraint_type,
    'column_name', kcu.column_name,
    'ordinal_position', kcu.ordinal_position
  )
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_schema = kcu.table_schema
 AND tc.table_name = kcu.table_name
WHERE tc.table_schema = 'public'
  AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')

UNION ALL
SELECT '04_foreign_keys',
  jsonb_build_object(
    'from_schema', tc.table_schema,
    'from_table', tc.table_name,
    'from_column', kcu.column_name,
    'from_ordinal', kcu.ordinal_position,
    'to_schema', ccu.table_schema,
    'to_table', ccu.table_name,
    'to_column', ccu.column_name,
    'constraint_name', tc.constraint_name
  )
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_schema = kcu.table_schema
 AND tc.table_name = kcu.table_name
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
 AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'

UNION ALL
SELECT '05_other_constraints',
  jsonb_build_object(
    'table_schema', tc.table_schema,
    'table_name', tc.table_name,
    'constraint_name', tc.constraint_name,
    'constraint_type', tc.constraint_type,
    'check_clause', cc.check_clause
  )
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.check_constraints cc
  ON tc.constraint_name = cc.constraint_name
 AND tc.table_schema = cc.constraint_schema
WHERE tc.table_schema = 'public'
  AND tc.constraint_type NOT IN ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE')

UNION ALL
SELECT '06_indexes',
  jsonb_build_object(
    'schemaname', i.schemaname,
    'tablename', i.tablename,
    'indexname', i.indexname,
    'indexdef', i.indexdef
  )
FROM pg_indexes i
WHERE i.schemaname = 'public'

UNION ALL
SELECT '07_views',
  jsonb_build_object(
    'table_schema', v.table_schema,
    'table_name', v.table_name,
    'view_definition', v.view_definition
  )
FROM information_schema.views v
WHERE v.table_schema = 'public'

UNION ALL
SELECT '08_triggers',
  jsonb_build_object(
    'trigger_schema', t.trigger_schema,
    'table_name', t.event_object_table,
    'trigger_name', t.trigger_name,
    'event_manipulation', t.event_manipulation,
    'action_timing', t.action_timing,
    'action_orientation', t.action_orientation,
    'action_statement', t.action_statement
  )
FROM information_schema.triggers t
WHERE t.trigger_schema = 'public'

UNION ALL
SELECT '09_rls_table_flags',
  jsonb_build_object(
    'table_name', c.relname,
    'rls_enabled', c.relrowsecurity,
    'rls_forced', c.relforcerowsecurity
  )
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'

UNION ALL
SELECT '10_rls_policies',
  jsonb_build_object(
    'schemaname', p.schemaname,
    'tablename', p.tablename,
    'policyname', p.policyname,
    'permissive', p.permissive,
    'roles', to_jsonb(p.roles),
    'cmd', p.cmd,
    'qual', p.qual,
    'with_check', p.with_check
  )
FROM pg_policies p
WHERE p.schemaname = 'public'

UNION ALL
SELECT '11_storage_buckets',
  jsonb_build_object(
    'id', b.id,
    'name', b.name,
    'public', b.public,
    'file_size_limit', b.file_size_limit,
    'allowed_mime_types', to_jsonb(b.allowed_mime_types)
  )
FROM storage.buckets b

UNION ALL
SELECT '12_extensions',
  jsonb_build_object(
    'extname', e.extname,
    'extversion', e.extversion
  )
FROM pg_extension e
ORDER BY 1, 2;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  OPTION B — separate queries (if Option A fails: run one block at a time)  ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

/*
-- 1) TABLES
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

-- 2) COLUMNS
SELECT
  c.table_schema,
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.character_maximum_length,
  c.numeric_precision,
  c.numeric_scale,
  c.is_nullable,
  c.column_default
FROM information_schema.columns c
WHERE c.table_schema = 'public'
ORDER BY c.table_name, c.ordinal_position;

-- 3) PRIMARY KEYS & UNIQUE
SELECT
  tc.table_schema,
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  kcu.ordinal_position
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_schema = kcu.table_schema
 AND tc.table_name = kcu.table_name
WHERE tc.table_schema = 'public'
  AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
ORDER BY tc.table_name, tc.constraint_type, kcu.ordinal_position;

-- 4) FOREIGN KEYS
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
 AND tc.table_schema = kcu.table_schema
 AND tc.table_name = kcu.table_name
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
 AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name;

-- 5) CHECK & other constraints
SELECT
  tc.table_schema,
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  cc.check_clause
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.check_constraints cc
  ON tc.constraint_name = cc.constraint_name
 AND tc.table_schema = cc.constraint_schema
WHERE tc.table_schema = 'public'
  AND tc.constraint_type NOT IN ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE')
ORDER BY tc.table_name, tc.constraint_name;

-- 6) INDEXES
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- 7) VIEWS
SELECT table_schema, table_name, view_definition
FROM information_schema.views
WHERE table_schema = 'public'
ORDER BY table_name;

-- 8) TRIGGERS
SELECT
  trigger_schema,
  event_object_table AS table_name,
  trigger_name,
  event_manipulation,
  action_timing,
  action_orientation,
  action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- 9) RLS flags
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;

-- 10) RLS policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 11) Storage buckets
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
ORDER BY name;

-- 12) Extensions
SELECT extname, extversion FROM pg_extension ORDER BY extname;
*/
