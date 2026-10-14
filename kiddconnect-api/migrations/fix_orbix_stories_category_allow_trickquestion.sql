-- Fix: allow TRICK_QUESTION_GENERATOR in orbix_sources and trickquestion in orbix_stories (fixes 23514 check constraint violations).
-- Run in Supabase SQL Editor. Idempotent.

-- 1. orbix_sources: allow type TRICK_QUESTION_GENERATOR (so "Trick Question Generator" source can be added)
ALTER TABLE orbix_sources DROP CONSTRAINT IF EXISTS orbix_sources_type_check;
ALTER TABLE orbix_sources ADD CONSTRAINT orbix_sources_type_check
  CHECK (type IN (
    'RSS', 'HTML', 'WIKIPEDIA', 'TRIVIA_GENERATOR', 'WIKIDATA_FACTS',
    'RIDDLE_GENERATOR', 'MIND_TEASER_GENERATOR', 'DAD_JOKE_GENERATOR', 'TRICK_QUESTION_GENERATOR'
  ));

-- 2. orbix_stories: allow category trickquestion, remove money
-- Order matters: DROP first, then UPDATE, then ADD (otherwise UPDATE fails the old check).

ALTER TABLE orbix_stories DROP CONSTRAINT IF EXISTS orbix_stories_category_check;
-- Drop any other category check (e.g. auto-generated name from CREATE TABLE)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'orbix_stories'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%category%'
  )
  LOOP
    EXECUTE format('ALTER TABLE orbix_stories DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

UPDATE orbix_stories SET category = 'trickquestion' WHERE category = 'money';

ALTER TABLE orbix_stories ADD CONSTRAINT orbix_stories_category_check
  CHECK (category IN (
    'ai-automation', 'corporate-collapses', 'tech-decisions', 'laws-rules',
    'money-markets', 'psychology', 'trivia', 'facts', 'riddle', 'mindteaser', 'dadjoke', 'trickquestion'
  ));
