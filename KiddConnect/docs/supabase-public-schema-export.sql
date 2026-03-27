-- =============================================================================
-- Export ALL public tables + columns (run in Supabase → SQL Editor)
-- Paste results to CSV, or use "Download as CSV" if your SQL client supports it.
-- Core tenant tables (businesses, users, ai_agents, …) often predate migrations in
-- git and gain columns via ALTER — this query reflects the LIVE database only.
-- =============================================================================

SELECT
  c.table_name,
  c.ordinal_position AS pos,
  c.column_name,
  CASE
    WHEN c.data_type = 'USER-DEFINED' THEN c.udt_name::text
    WHEN c.character_maximum_length IS NOT NULL
      THEN c.data_type || '(' || c.character_maximum_length || ')'
    WHEN c.numeric_precision IS NOT NULL
      THEN c.data_type || '(' || c.numeric_precision || COALESCE(',' || c.numeric_scale::text, '') || ')'
    ELSE c.data_type
  END AS data_type,
  c.is_nullable,
  c.column_default
FROM information_schema.columns c
WHERE c.table_schema = 'public'
ORDER BY c.table_name, c.ordinal_position;

-- Optional: table row counts + sizes (same editor, second query)
-- SELECT
--   relname AS table_name,
--   reltuples::bigint AS estimated_rows,
--   pg_size_pretty(pg_total_relation_size(oid)) AS total_size
-- FROM pg_class c
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public' AND c.relkind = 'r'
-- ORDER BY relname;
