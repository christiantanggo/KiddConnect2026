-- =============================================================================
-- OLD DATABASE — Option B: run ONE block at a time (Supabase SQL Editor, SOURCE DB)
-- Same data as Option A in old-database-export-for-migration.sql, split for timeouts.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) TABLES
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 2) COLUMNS
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 3) PRIMARY KEYS & UNIQUE
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 4) FOREIGN KEYS
-- -----------------------------------------------------------------------------
SELECT
  tc.table_schema AS from_schema,
  tc.table_name AS from_table,
  kcu.column_name AS from_column,
  kcu.ordinal_position AS from_ordinal,
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
ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position;

-- -----------------------------------------------------------------------------
-- 5) CHECK & other constraints
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 6) INDEXES
-- -----------------------------------------------------------------------------
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- -----------------------------------------------------------------------------
-- 7) VIEWS
-- -----------------------------------------------------------------------------
SELECT table_schema, table_name, view_definition
FROM information_schema.views
WHERE table_schema = 'public'
ORDER BY table_name;

-- -----------------------------------------------------------------------------
-- 8) TRIGGERS
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 9) RLS flags
-- -----------------------------------------------------------------------------
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;

-- -----------------------------------------------------------------------------
-- 10) RLS policies
-- -----------------------------------------------------------------------------
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- -----------------------------------------------------------------------------
-- 11) Storage buckets
-- -----------------------------------------------------------------------------
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
ORDER BY name;

-- -----------------------------------------------------------------------------
-- 12) Extensions
-- -----------------------------------------------------------------------------
SELECT extname, extversion FROM pg_extension ORDER BY extname;
