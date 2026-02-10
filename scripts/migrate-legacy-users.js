/**
 * Migration Script: Migrate Legacy Users to Organization Users
 * 
 * Creates organization_users entries for all existing users who have
 * a business_id but no organization_users entry. This bridges the gap
 * between the legacy system and the new v2 multi-tenant system.
 * 
 * Usage:
 *   node scripts/migrate-legacy-users.js
 */

import { supabaseClient } from '../config/database.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigration() {
  try {
    console.log('🔄 Starting migration: Legacy Users → Organization Users');
    console.log('');

    // Read the migration SQL
    const migrationPath = join(__dirname, '../migrations/migrate_legacy_users_to_organizations.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    // Split into individual statements (split on semicolons, but be careful with comments)
    // For simplicity, we'll execute the main INSERT statement
    const insertSQL = `
      INSERT INTO organization_users (business_id, user_id, role, created_at, updated_at)
      SELECT 
        u.business_id,
        u.id AS user_id,
        COALESCE(u.role, 'owner') AS role,
        u.created_at,
        NOW() AS updated_at
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
        )
        AND EXISTS (
          SELECT 1 
          FROM businesses b 
          WHERE b.id = u.business_id 
            AND b.deleted_at IS NULL
        )
    `;

    console.log('📊 Checking existing users...');
    
    // First, check how many users need migration
    const { data: usersToMigrate, error: countError } = await supabaseClient
      .from('users')
      .select('id, business_id, role, email', { count: 'exact' })
      .not('business_id', 'is', null)
      .is('deleted_at', null);

    if (countError) {
      throw new Error(`Failed to query users: ${countError.message}`);
    }

    // Check existing organization_users entries
    const { data: existingOrgUsers, error: orgUsersError } = await supabaseClient
      .from('organization_users')
      .select('user_id, business_id', { count: 'exact' })
      .is('deleted_at', null);

    if (orgUsersError) {
      throw new Error(`Failed to query organization_users: ${orgUsersError.message}`);
    }

    const usersNeedingMigration = (usersToMigrate || []).filter(user => {
      return !(existingOrgUsers || []).some(
        ou => ou.user_id === user.id && ou.business_id === user.business_id
      );
    });

    console.log(`   Found ${usersToMigrate?.length || 0} users with business_id`);
    console.log(`   Found ${existingOrgUsers?.length || 0} existing organization_users entries`);
    console.log(`   ${usersNeedingMigration.length} users need migration`);
    console.log('');

    if (usersNeedingMigration.length === 0) {
      console.log('✅ No users need migration. All users already have organization_users entries.');
      return;
    }

    console.log('📝 Migrating users...');
    
    // Migrate users one by one to handle errors gracefully
    let migrated = 0;
    let errors = 0;

    for (const user of usersNeedingMigration) {
      try {
        // Check if business exists
        const { data: business, error: businessError } = await supabaseClient
          .from('businesses')
          .select('id')
          .eq('id', user.business_id)
          .is('deleted_at', null)
          .single();

        if (businessError || !business) {
          console.warn(`   ⚠️  Skipping user ${user.email}: Business ${user.business_id} not found or deleted`);
          errors++;
          continue;
        }

        // Check if entry already exists (race condition protection)
        const { data: existing } = await supabaseClient
          .from('organization_users')
          .select('id')
          .eq('user_id', user.id)
          .eq('business_id', user.business_id)
          .is('deleted_at', null)
          .single();

        if (existing) {
          console.log(`   ✓ User ${user.email} already has organization_users entry`);
          continue;
        }

        // Create organization_users entry
        const { error: insertError } = await supabaseClient
          .from('organization_users')
          .insert({
            business_id: user.business_id,
            user_id: user.id,
            role: user.role || 'owner',
            created_at: user.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

        if (insertError) {
          console.error(`   ❌ Failed to migrate user ${user.email}: ${insertError.message}`);
          errors++;
        } else {
          migrated++;
          if (migrated % 10 === 0) {
            console.log(`   ... migrated ${migrated} users`);
          }
        }
      } catch (err) {
        console.error(`   ❌ Error migrating user ${user.email}:`, err.message);
        errors++;
      }
    }

    console.log('');
    console.log('✅ Migration complete!');
    console.log(`   ✓ Migrated: ${migrated} users`);
    if (errors > 0) {
      console.log(`   ⚠️  Errors: ${errors} users`);
    }
    console.log('');

    // Verify migration
    console.log('🔍 Verifying migration...');
    const { data: allOrgUsers, error: verifyError } = await supabaseClient
      .from('organization_users')
      .select('*', { count: 'exact' })
      .is('deleted_at', null);

    if (verifyError) {
      console.warn(`   ⚠️  Could not verify: ${verifyError.message}`);
    } else {
      console.log(`   ✓ Total organization_users entries: ${allOrgUsers?.length || 0}`);
      
      // Check for remaining legacy users
      const { data: remainingUsers } = await supabaseClient
        .from('users')
        .select('id', { count: 'exact' })
        .not('business_id', 'is', null)
        .is('deleted_at', null);

      const { data: orgUsersForRemaining } = await supabaseClient
        .from('organization_users')
        .select('user_id')
        .is('deleted_at', null);

      const remainingUserIds = (remainingUsers || []).map(u => u.id);
      const migratedUserIds = (orgUsersForRemaining || []).map(ou => ou.user_id);
      const stillNeedingMigration = remainingUserIds.filter(id => !migratedUserIds.includes(id));

      if (stillNeedingMigration.length === 0) {
        console.log('   ✅ All users have been migrated!');
      } else {
        console.warn(`   ⚠️  ${stillNeedingMigration.length} users still need migration`);
      }
    }

  } catch (error) {
    console.error('');
    console.error('❌ Migration failed:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run migration
runMigration()
  .then(() => {
    console.log('');
    console.log('🎉 Migration script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('');
    console.error('💥 Migration script failed:', error);
    process.exit(1);
  });





