# Migrate Legacy Users to Organization Users

This migration creates `organization_users` entries for all existing users who have a `business_id` but no corresponding entry in the `organization_users` table.

## Why This Migration?

The v2 system uses the `organization_users` table as the source of truth for multi-organization membership. Legacy users who were created before v2 only have `users.business_id` and need `organization_users` entries to work properly with the new dashboard.

## How to Run

### Option 1: Run the Node.js Script (Recommended)

```bash
npm run migrate:legacy-users
```

This script will:
- Check how many users need migration
- Migrate them one by one with error handling
- Show progress and results
- Verify the migration was successful

### Option 2: Run SQL Directly

If you prefer to run the SQL directly in Supabase SQL Editor:

1. Open `migrations/migrate_legacy_users_to_organizations.sql`
2. Copy the SQL statements
3. Run in Supabase Dashboard → SQL Editor

## What It Does

1. **Creates `organization_users` entries** for all users with `business_id`:
   - Uses the user's existing role (or defaults to 'owner')
   - Preserves the original creation date
   - Only migrates active users (not deleted)
   - Only migrates users whose businesses still exist

2. **Skips users who already have entries** in `organization_users`

3. **Validates businesses exist** before creating entries

## Safety

- ✅ Idempotent: Safe to run multiple times (won't create duplicates)
- ✅ Non-destructive: Only adds new entries, doesn't modify existing data
- ✅ Validates: Checks businesses exist and users are active
- ✅ Preserves: Keeps original creation dates and roles

## After Migration

Once migration is complete:
- All existing users will have `organization_users` entries
- The v2 dashboard will work for all users
- Users can be added to multiple organizations going forward
- The legacy `users.business_id` field is still present but not required for v2

## Verification

After running the migration, you can verify success:

```sql
-- Check all users have organization_users entries
SELECT 
  COUNT(DISTINCT u.id) AS total_users,
  COUNT(DISTINCT ou.user_id) AS users_with_org_entries
FROM users u
LEFT JOIN organization_users ou ON ou.user_id = u.id AND ou.deleted_at IS NULL
WHERE u.business_id IS NOT NULL AND u.deleted_at IS NULL;
```

Both counts should be equal if migration was successful.





