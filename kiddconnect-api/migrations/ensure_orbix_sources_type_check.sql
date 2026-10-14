-- Ensure orbix_sources and orbix_stories allow all generator types (fixes 500 when adding Mind Teaser / Dad Joke if earlier migrations were skipped).
-- Idempotent: safe to run even if constraints already include these types.

ALTER TABLE orbix_sources DROP CONSTRAINT IF EXISTS orbix_sources_type_check;
ALTER TABLE orbix_sources ADD CONSTRAINT orbix_sources_type_check
  CHECK (type IN (
    'RSS',
    'HTML',
    'WIKIPEDIA',
    'TRIVIA_GENERATOR',
    'WIKIDATA_FACTS',
    'RIDDLE_GENERATOR',
    'MIND_TEASER_GENERATOR',
    'DAD_JOKE_GENERATOR',
    'TRICK_QUESTION_GENERATOR'
  ));

ALTER TABLE orbix_stories DROP CONSTRAINT IF EXISTS orbix_stories_category_check;
ALTER TABLE orbix_stories ADD CONSTRAINT orbix_stories_category_check
  CHECK (category IN ('ai-automation', 'corporate-collapses', 'tech-decisions', 'laws-rules', 'money-markets', 'psychology', 'trivia', 'facts', 'riddle', 'mindteaser', 'dadjoke', 'trickquestion'));
