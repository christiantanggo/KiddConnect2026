-- Replace Money channel with Trick Question channel (same format as trivia/riddle/dad jokes).
-- Run in Supabase SQL Editor. Idempotent.

-- 1. Migrate existing money stories to trickquestion (so constraint change doesn't break them)
UPDATE orbix_stories SET category = 'trickquestion' WHERE category = 'money';

-- 2. Story categories: remove 'money', add 'trickquestion'
ALTER TABLE orbix_stories DROP CONSTRAINT IF EXISTS orbix_stories_category_check;
ALTER TABLE orbix_stories ADD CONSTRAINT orbix_stories_category_check
  CHECK (category IN (
    'ai-automation', 'corporate-collapses', 'tech-decisions', 'laws-rules',
    'money-markets', 'psychology', 'trivia', 'facts', 'riddle', 'mindteaser', 'dadjoke', 'trickquestion'
  ));

-- 3. Source types: add TRICK_QUESTION_GENERATOR (money was not a source type; Wikipedia Money used WIKIPEDIA + category)
ALTER TABLE orbix_sources DROP CONSTRAINT IF EXISTS orbix_sources_type_check;
ALTER TABLE orbix_sources ADD CONSTRAINT orbix_sources_type_check
  CHECK (type IN (
    'RSS', 'HTML', 'WIKIPEDIA', 'TRIVIA_GENERATOR', 'WIKIDATA_FACTS',
    'RIDDLE_GENERATOR', 'MIND_TEASER_GENERATOR', 'DAD_JOKE_GENERATOR', 'TRICK_QUESTION_GENERATOR'
  ));

COMMENT ON COLUMN orbix_scripts.content_type IS 'news | trivia | facts | riddle | mindteaser | dadjoke | trickquestion — generator types use content_json';
