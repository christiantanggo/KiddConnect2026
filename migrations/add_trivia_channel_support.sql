-- Orbix Trivia Channel support
-- Trivia: AI-generated questions, no scraping; content_fingerprint for dedup; TRIVIA_GENERATOR source type.

-- 1. Add trivia to story categories
ALTER TABLE orbix_stories DROP CONSTRAINT IF EXISTS orbix_stories_category_check;
ALTER TABLE orbix_stories ADD CONSTRAINT orbix_stories_category_check
  CHECK (category IN ('ai-automation', 'corporate-collapses', 'tech-decisions', 'laws-rules', 'money-markets', 'psychology', 'money', 'trivia'));

-- 2. Add TRIVIA_GENERATOR to source types (trivia channels have generator, not RSS/Wikipedia)
ALTER TABLE orbix_sources DROP CONSTRAINT IF EXISTS orbix_sources_type_check;
ALTER TABLE orbix_sources ADD CONSTRAINT orbix_sources_type_check
  CHECK (type IN ('RSS', 'HTML', 'WIKIPEDIA', 'TRIVIA_GENERATOR'));

-- 3. Allow empty URL for TRIVIA_GENERATOR (sources use url = 'trivia://' or similar)
-- URL stays NOT NULL; use placeholder for trivia generator
-- No schema change needed - use 'trivia://generator' as url

-- 4. Add content_fingerprint to orbix_raw_items for trivia deduplication
ALTER TABLE orbix_raw_items
  ADD COLUMN IF NOT EXISTS content_fingerprint VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_orbix_raw_items_content_fingerprint ON orbix_raw_items(content_fingerprint) WHERE content_fingerprint IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orbix_raw_items_channel_fingerprint ON orbix_raw_items(channel_id, content_fingerprint) WHERE content_fingerprint IS NOT NULL AND channel_id IS NOT NULL;

-- 5. Add content_json to orbix_scripts for trivia payload (question, options, voice_script, etc.)
ALTER TABLE orbix_scripts
  ADD COLUMN IF NOT EXISTS content_json JSONB;

-- 6. Add content_type to orbix_scripts to distinguish news vs trivia (trivia uses content_json; news uses hook/what_happened etc.)
ALTER TABLE orbix_scripts
  ADD COLUMN IF NOT EXISTS content_type VARCHAR(20) DEFAULT 'news';

-- 7. Relax NOT NULL on script body for trivia (content lives in content_json)
-- PostgreSQL: we cannot easily alter NOT NULL without default; use '' as fallback in application
-- No migration change - app will insert '' for what_happened etc when content_type='trivia'

COMMENT ON COLUMN orbix_raw_items.content_fingerprint IS 'SHA-256 of normalized question+answer for trivia dedup; scoped per channel';
COMMENT ON COLUMN orbix_scripts.content_json IS 'Trivia payload: hook, category, question, option_a/b/c, correct_answer, voice_script, episode_number';
COMMENT ON COLUMN orbix_scripts.content_type IS 'news | trivia - trivia uses content_json for full payload';
