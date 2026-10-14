-- Orbix Dad Jokes channel support
-- Dad jokes: AI-generated setup + punchline; content_fingerprint for dedup; DAD_JOKE_GENERATOR source type.
-- Follows the same pattern as add_riddle_channel_support.sql and add_mind_teaser_channel_support.sql.

-- 1. Add dadjoke to story categories
ALTER TABLE orbix_stories DROP CONSTRAINT IF EXISTS orbix_stories_category_check;
ALTER TABLE orbix_stories ADD CONSTRAINT orbix_stories_category_check
  CHECK (category IN ('ai-automation', 'corporate-collapses', 'tech-decisions', 'laws-rules', 'money-markets', 'psychology', 'money', 'trivia', 'facts', 'riddle', 'mindteaser', 'dadjoke'));

-- 2. Add DAD_JOKE_GENERATOR to source types
ALTER TABLE orbix_sources DROP CONSTRAINT IF EXISTS orbix_sources_type_check;
ALTER TABLE orbix_sources ADD CONSTRAINT orbix_sources_type_check
  CHECK (type IN ('RSS', 'HTML', 'WIKIPEDIA', 'TRIVIA_GENERATOR', 'WIKIDATA_FACTS', 'RIDDLE_GENERATOR', 'MIND_TEASER_GENERATOR', 'DAD_JOKE_GENERATOR'));

COMMENT ON COLUMN orbix_scripts.content_type IS 'news | trivia | facts | riddle | mindteaser | dadjoke — trivia/facts/riddle/mindteaser/dadjoke use content_json for full payload';
