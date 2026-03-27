-- =============================================================================
-- OLD DATABASE (Tavari) — Option C: one table at a time (Supabase SQL Editor)
-- Run on SOURCE. Change :table_name in each block (search/replace one name).
-- Paste results (or download CSV) per table; avoids huge single results.
--
-- After you have a full Option A JSON export, generate DDL locally:
--   node KiddConnect/scripts/generate-ddl-from-supabase-audit.cjs path/to/export.json > public-ddl.sql
-- Or merge several small JSON arrays into one array for the same script.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- C1) Columns for ONE table
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
  AND c.table_name = 'REPLACE_WITH_TABLE_NAME'
ORDER BY c.ordinal_position;

-- -----------------------------------------------------------------------------
-- C2) PRIMARY KEY & UNIQUE for ONE table
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
  AND tc.table_name = 'REPLACE_WITH_TABLE_NAME'
  AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
ORDER BY tc.constraint_type, tc.constraint_name, kcu.ordinal_position;

-- -----------------------------------------------------------------------------
-- C3) FOREIGN KEYS touching ONE table (from OR to)
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
  AND (
    tc.table_name = 'REPLACE_WITH_TABLE_NAME'
    OR ccu.table_name = 'REPLACE_WITH_TABLE_NAME'
  )
ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position;

-- -----------------------------------------------------------------------------
-- C4) CHECK / other constraints for ONE table
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
  AND tc.table_name = 'REPLACE_WITH_TABLE_NAME'
  AND tc.constraint_type NOT IN ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE')
ORDER BY tc.constraint_name;

-- -----------------------------------------------------------------------------
-- C5) Indexes for ONE table
-- -----------------------------------------------------------------------------
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'REPLACE_WITH_TABLE_NAME'
ORDER BY indexname;
