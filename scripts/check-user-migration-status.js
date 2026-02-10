/**
 * Check User Migration Status
 * 
 * Verifies if users need migration from legacy business_id to organization_users
 * 
 * Usage:
 *   node scripts/check-user-migration-status.js
 */

import { supabaseClient } from '../config/database.js';

async function checkStatus() {
  try {
    console.log('🔍 Checking user migration status...');
    console.log('');

    // Check total users with business_id
    const { data: allUsers, error: usersError } = await supabaseClient
      .from('users')
      .select('id, email, business_id, role, created_at')
      .not('business_id', 'is', null)
      .is('deleted_at', null);

    if (usersError) {
      throw new Error(`Failed to query users: ${usersError.message}`);
    }

    console.log(`📊 Total active users with business_id: ${allUsers?.length || 0}`);
    
    if (!allUsers || allUsers.length === 0) {
      console.log('   ℹ️  No users found with business_id');
      return;
    }

    // Check organization_users entries
    const { data: orgUsers, error: orgUsersError } = await supabaseClient
      .from('organization_users')
      .select('user_id, business_id, role, created_at')
      .is('deleted_at', null);

    if (orgUsersError) {
      throw new Error(`Failed to query organization_users: ${orgUsersError.message}`);
    }

    console.log(`📊 Total organization_users entries: ${orgUsers?.length || 0}`);
    console.log('');

    // Check which users need migration
    const userMap = new Map();
    (allUsers || []).forEach(user => {
      userMap.set(user.id, user);
    });

    const orgUserMap = new Map();
    (orgUsers || []).forEach(ou => {
      const key = `${ou.user_id}-${ou.business_id}`;
      if (!orgUserMap.has(ou.user_id)) {
        orgUserMap.set(ou.user_id, []);
      }
      orgUserMap.get(ou.user_id).push(ou.business_id);
    });

    console.log('📋 User Migration Status:');
    console.log('');

    let migratedCount = 0;
    let needMigrationCount = 0;
    const usersNeedingMigration = [];

    for (const user of allUsers) {
      const hasOrgEntry = orgUserMap.has(user.id) && 
                         orgUserMap.get(user.id).includes(user.business_id);
      
      if (hasOrgEntry) {
        migratedCount++;
      } else {
        needMigrationCount++;
        usersNeedingMigration.push(user);
        console.log(`   ❌ ${user.email} - NEEDS MIGRATION`);
        console.log(`      Business ID: ${user.business_id}`);
        console.log(`      Role: ${user.role || 'owner'}`);
      }
    }

    console.log('');
    console.log('📈 Summary:');
    console.log(`   ✅ Migrated: ${migratedCount} users`);
    console.log(`   ❌ Need Migration: ${needMigrationCount} users`);
    console.log('');

    if (needMigrationCount > 0) {
      console.log('💡 To migrate these users, run:');
      console.log('   npm run migrate:legacy-users');
      console.log('');
    } else {
      console.log('✅ All users have been migrated!');
      console.log('');
    }

    // Check businesses exist for users needing migration
    if (usersNeedingMigration.length > 0) {
      console.log('🔍 Verifying businesses exist...');
      
      const businessIds = [...new Set(usersNeedingMigration.map(u => u.business_id))];
      
      for (const businessId of businessIds) {
        const { data: business, error: bizError } = await supabaseClient
          .from('businesses')
          .select('id, name, email')
          .eq('id', businessId)
          .is('deleted_at', null)
          .single();

        if (bizError || !business) {
          console.log(`   ⚠️  Business ${businessId} not found or deleted`);
        } else {
          const count = usersNeedingMigration.filter(u => u.business_id === businessId).length;
          console.log(`   ✓ Business "${business.name}" (${businessId}): ${count} user(s) need migration`);
        }
      }
    }

  } catch (error) {
    console.error('');
    console.error('❌ Check failed:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run check
checkStatus()
  .then(() => {
    console.log('✅ Status check complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('');
    console.error('💥 Status check failed:', error);
    process.exit(1);
  });





