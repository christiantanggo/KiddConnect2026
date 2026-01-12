-- ============================================================
-- Migration: Migrate Legacy Users to Organization Users
-- ============================================================
-- Purpose: Creates organization_users entries for existing users
--          who have business_id but no organization_users entry
-- 
-- This migration bridges the gap between the legacy system (where
-- users.business_id directly references businesses) and the new v2
-- multi-tenant system (where organization_users manages relationships)
--
-- Run this AFTER create_v2_tables.sql
-- ============================================================

-- Step 1: Create organization_users entries for all users who have a business_id
-- but don't already have an organization_users entry
INSERT INTO organization_users (business_id, user_id, role, created_at, updated_at)
SELECT 
  u.business_id,
  u.id AS user_id,
  COALESCE(u.role, 'owner') AS role, -- Use user's role, default to 'owner'
  u.created_at, -- Preserve original creation date
  NOW() AS updated_at
FROM users u
WHERE 
  u.business_id IS NOT NULL
  AND u.deleted_at IS NULL -- Only migrate active users
  AND NOT EXISTS (
    -- Skip if organization_users entry already exists
    SELECT 1 
    FROM organization_users ou 
    WHERE ou.business_id = u.business_id 
      AND ou.user_id = u.id
      AND ou.deleted_at IS NULL
  )
  AND EXISTS (
    -- Only migrate if the business still exists and is active
    SELECT 1 
    FROM businesses b 
    WHERE b.id = u.business_id 
      AND b.deleted_at IS NULL
  );

-- Step 2: Verify migration results
-- This query will show you how many users were migrated
SELECT 
  COUNT(*) AS migrated_users,
  COUNT(DISTINCT business_id) AS unique_businesses,
  COUNT(DISTINCT role) AS different_roles
FROM organization_users ou
WHERE ou.created_at >= NOW() - INTERVAL '5 minutes' -- Created in last 5 minutes (approximate for migration run)

UNION ALL

-- This query shows any remaining legacy users (should be 0 after migration)
SELECT 
  COUNT(*) AS remaining_legacy_users,
  0 AS unused,
  0 AS unused
FROM users u
WHERE 
  u.business_id IS NOT NULL
  AND u.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 
    FROM organization_users ou 
    WHERE ou.business_id = u.business_id 
      AND ou.user_id = u.id
      AND ou.deleted_at IS NULL
  );

-- ============================================================
-- Migration Complete
-- ============================================================
-- After running this migration:
-- 1. All existing users with business_id will have organization_users entries
-- 2. The v2 dashboard will work for all users without legacy fallbacks
-- 3. Users can now be part of multiple organizations if needed
--
-- To verify success, check that:
-- - migrated_users count > 0 (or equals your expected user count)
-- - remaining_legacy_users = 0
-- ============================================================


