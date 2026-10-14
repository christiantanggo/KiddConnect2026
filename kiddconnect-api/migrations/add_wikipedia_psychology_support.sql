-- Wikipedia psychology source type and story category for Orbix Network

-- 1. Allow WIKIPEDIA as a source type
ALTER TABLE orbix_sources DROP CONSTRAINT IF EXISTS orbix_sources_type_check;
ALTER TABLE orbix_sources ADD CONSTRAINT orbix_sources_type_check
  CHECK (type IN ('RSS', 'HTML', 'WIKIPEDIA'));

-- 2. Allow psychology as a story category (for evergreen/Wikipedia content)
ALTER TABLE orbix_stories DROP CONSTRAINT IF EXISTS orbix_stories_category_check;
ALTER TABLE orbix_stories ADD CONSTRAINT orbix_stories_category_check
  CHECK (category IN ('ai-automation', 'corporate-collapses', 'tech-decisions', 'laws-rules', 'money-markets', 'psychology'));
