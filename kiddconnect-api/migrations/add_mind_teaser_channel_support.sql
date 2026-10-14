-- Orbix Mind Teasers Channel support
-- Mind teasers: AI-generated puzzles (logic, math, sequence, text illusion); content_fingerprint for dedup; MIND_TEASER_GENERATOR source type.
-- Follows the same pattern as add_trivia_channel_support.sql and add_riddle_channel_support.sql.

-- 1. Add mindteaser to story categories
ALTER TABLE orbix_stories DROP CONSTRAINT IF EXISTS orbix_stories_category_check;
ALTER TABLE orbix_stories ADD CONSTRAINT orbix_stories_category_check
  CHECK (category IN ('ai-automation', 'corporate-collapses', 'tech-decisions', 'laws-rules', 'money-markets', 'psychology', 'money', 'trivia', 'facts', 'riddle', 'mindteaser'));

-- 2. Add MIND_TEASER_GENERATOR to source types
ALTER TABLE orbix_sources DROP CONSTRAINT IF EXISTS orbix_sources_type_check;
ALTER TABLE orbix_sources ADD CONSTRAINT orbix_sources_type_check
  CHECK (type IN ('RSS', 'HTML', 'WIKIPEDIA', 'TRIVIA_GENERATOR', 'WIKIDATA_FACTS', 'RIDDLE_GENERATOR', 'MIND_TEASER_GENERATOR'));

-- content_fingerprint on orbix_raw_items and content_json/content_type on orbix_scripts already exist — no change needed.
-- URL placeholder for MIND_TEASER_GENERATOR: use 'mindteaser://generator' (same sentinel pattern as trivia/riddle).

COMMENT ON COLUMN orbix_scripts.content_type IS 'news | trivia | facts | riddle | mindteaser — trivia/facts/riddle/mindteaser use content_json for full payload';
