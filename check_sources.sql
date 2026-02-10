-- Check how many sources are configured for Orbix Network
-- This will help diagnose why only 2 stories were scraped

-- Check all sources (enabled and disabled)
SELECT 
  id,
  business_id,
  name,
  type,
  url,
  enabled,
  last_fetched_at,
  created_at
FROM orbix_sources
ORDER BY enabled DESC, created_at DESC;

-- Count sources by business
SELECT 
  business_id,
  COUNT(*) as total_sources,
  COUNT(*) FILTER (WHERE enabled = true) as enabled_sources,
  COUNT(*) FILTER (WHERE enabled = false) as disabled_sources
FROM orbix_sources
GROUP BY business_id;

-- Check recent raw items to see what was actually scraped
SELECT 
  id,
  source_id,
  title,
  url,
  status,
  created_at,
  published_at
FROM orbix_raw_items
ORDER BY created_at DESC
LIMIT 20;

-- Count raw items by source
SELECT 
  source_id,
  COUNT(*) as total_items,
  COUNT(*) FILTER (WHERE status = 'NEW') as new_items,
  COUNT(*) FILTER (WHERE status = 'PROCESSED') as processed_items
FROM orbix_raw_items
GROUP BY source_id
ORDER BY total_items DESC;

