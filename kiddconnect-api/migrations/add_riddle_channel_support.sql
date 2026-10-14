-- Orbix Riddle Channel support
-- Riddles: AI-generated riddles with answer reveal; content_fingerprint for dedup; RIDDLE_GENERATOR source type.
-- Follows the same pattern as add_trivia_channel_support.sql and add_facts_channel_support.sql.

-- 1. Add riddle to story categories
ALTER TABLE orbix_stories DROP CONSTRAINT IF EXISTS orbix_stories_category_check;
ALTER TABLE orbix_stories ADD CONSTRAINT orbix_stories_category_check
  CHECK (category IN ('ai-automation', 'corporate-collapses', 'tech-decisions', 'laws-rules', 'money-markets', 'psychology', 'money', 'trivia', 'facts', 'riddle'));

-- 2. Add RIDDLE_GENERATOR to source types
ALTER TABLE orbix_sources DROP CONSTRAINT IF EXISTS orbix_sources_type_check;
ALTER TABLE orbix_sources ADD CONSTRAINT orbix_sources_type_check
  CHECK (type IN ('RSS', 'HTML', 'WIKIPEDIA', 'TRIVIA_GENERATOR', 'WIKIDATA_FACTS', 'RIDDLE_GENERATOR'));

-- content_fingerprint column on orbix_raw_items already exists from trivia migration — no change needed.
-- content_json and content_type columns on orbix_scripts already exist from trivia migration — no change needed.
-- URL placeholder for RIDDLE_GENERATOR: use 'riddle://generator' (same sentinel pattern as trivia).

COMMENT ON COLUMN orbix_scripts.content_type IS 'news | trivia | facts | riddle — trivia/facts/riddle use content_json for full payload';
