-- Clear all Orbix Network data for fresh start
-- WARNING: This will delete ALL stories, renders, videos, scripts, and publishes
-- Run this only if you want to start completely fresh

-- Delete in reverse dependency order to handle foreign keys gracefully
-- (Even though most have CASCADE, this ensures clean deletion)

-- 1. Delete publishes (references renders)
DELETE FROM orbix_publishes;

-- 2. Delete analytics (references platform_video_id via publishes)
DELETE FROM orbix_analytics_daily;

-- 3. Delete review queue entries (references stories/scripts)
DELETE FROM orbix_review_queue;

-- 4. Delete renders (references stories/scripts, and has CASCADE from publishes)
DELETE FROM orbix_renders;

-- 5. Delete scripts (references stories, has CASCADE from renders/review_queue)
DELETE FROM orbix_scripts;

-- 6. Delete stories (references raw_items with SET NULL, has CASCADE from scripts/renders)
DELETE FROM orbix_stories;

-- 7. Delete raw items (scraped news items)
DELETE FROM orbix_raw_items;

-- Verify deletion (uncomment to check)
-- SELECT 
--   (SELECT COUNT(*) FROM orbix_publishes) as publishes_count,
--   (SELECT COUNT(*) FROM orbix_analytics_daily) as analytics_count,
--   (SELECT COUNT(*) FROM orbix_review_queue) as review_queue_count,
--   (SELECT COUNT(*) FROM orbix_renders) as renders_count,
--   (SELECT COUNT(*) FROM orbix_scripts) as scripts_count,
--   (SELECT COUNT(*) FROM orbix_stories) as stories_count,
--   (SELECT COUNT(*) FROM orbix_raw_items) as raw_items_count;

