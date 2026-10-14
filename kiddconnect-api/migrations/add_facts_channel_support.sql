-- Orbix Facts Channel support
-- Facts: Wikidata-sourced fact items; content_fingerprint for dedup; WIKIDATA_FACTS source type.

-- 1. Add facts to story categories
ALTER TABLE orbix_stories DROP CONSTRAINT IF EXISTS orbix_stories_category_check;
ALTER TABLE orbix_stories ADD CONSTRAINT orbix_stories_category_check
  CHECK (category IN ('ai-automation', 'corporate-collapses', 'tech-decisions', 'laws-rules', 'money-markets', 'psychology', 'money', 'trivia', 'facts'));

-- 2. Add WIKIDATA_FACTS to source types
ALTER TABLE orbix_sources DROP CONSTRAINT IF EXISTS orbix_sources_type_check;
ALTER TABLE orbix_sources ADD CONSTRAINT orbix_sources_type_check
  CHECK (type IN ('RSS', 'HTML', 'WIKIPEDIA', 'TRIVIA_GENERATOR', 'WIKIDATA_FACTS'));

-- content_fingerprint and content_json already exist from trivia migration; reuse for facts.
COMMENT ON COLUMN orbix_scripts.content_type IS 'news | trivia | facts - trivia/facts use content_json for full payload';
