// scripts/check-and-fix-phone-numbers.js
// Utility script to check Telnyx numbers and ensure they're set up correctly for automatic assignment

import 'dotenv/config';
import { findUnassignedTelnyxNumbers, getAllVapiPhoneNumbers, checkIfNumberProvisionedInVAPI } from '../services/vapi.js';
import { Business } from '../models/Business.js';
import { supabaseClient } from '../config/database.js';

async function checkAndReportPhoneNumbers() {
  try {
    console.log('🔍 Checking phone number setup...\n');
    
    // Get all unassigned numbers from Telnyx
    console.log('1. Checking unassigned numbers in Telnyx...');
    const unassignedNumbers = await findUnassignedTelnyxNumbers();
    console.log(`   ✅ Found ${unassignedNumbers.length} unassigned numbers in Telnyx`);
    
    if (unassignedNumbers.length > 0) {
      console.log('\n   Unassigned numbers:');
      unassignedNumbers.forEach((num, idx) => {
        const phone = num.phone_number || num.number;
        console.log(`   ${idx + 1}. ${phone}`);
      });
    }
    
    // Get all numbers in VAPI
    console.log('\n2. Checking numbers provisioned in VAPI...');
    const vapiNumbers = await getAllVapiPhoneNumbers();
    console.log(`   ✅ Found ${vapiNumbers.length} numbers in VAPI`);
    
    if (vapiNumbers.length > 0) {
      console.log('\n   VAPI numbers:');
      for (const vapiNum of vapiNumbers) {
        const phone = vapiNum.phoneNumber || vapiNum.phone_number || vapiNum.number;
        const assistantId = vapiNum.assistantId || vapiNum.assistant?.id;
        console.log(`   - ${phone} (Assistant: ${assistantId || 'None'})`);
      }
    }
    
    // Get all businesses with phone numbers
    console.log('\n3. Checking businesses with assigned numbers...');
    const { data: businesses, error } = await supabaseClient
      .from('businesses')
      .select('id, name, vapi_phone_number, vapi_assistant_id')
      .not('vapi_phone_number', 'is', null);
    
    if (error) {
      console.error('   ❌ Error fetching businesses:', error);
    } else {
      console.log(`   ✅ Found ${businesses.length} businesses with phone numbers`);
      
      if (businesses.length > 0) {
        console.log('\n   Businesses with numbers:');
        businesses.forEach((biz, idx) => {
          console.log(`   ${idx + 1}. ${biz.name}: ${biz.vapi_phone_number} (Assistant: ${biz.vapi_assistant_id || 'None'})`);
        });
      }
    }
    
    // Check for numbers in VAPI but not assigned to businesses
    console.log('\n4. Checking for numbers in VAPI but not assigned to businesses...');
    const businessesWithNumbers = new Set(
      (businesses || [])
        .map(b => b.vapi_phone_number)
        .filter(n => n)
        .map(n => {
          let normalized = n.replace(/[^0-9+]/g, '');
          if (!normalized.startsWith('+')) {
            normalized = '+' + normalized;
          }
          return normalized;
        })
    );
    
    const orphanedVapiNumbers = vapiNumbers.filter(vapiNum => {
      const phone = vapiNum.phoneNumber || vapiNum.phone_number || vapiNum.number;
      if (!phone) return false;
      
      let normalized = phone.replace(/[^0-9+]/g, '');
      if (!normalized.startsWith('+')) {
        normalized = '+' + normalized;
      }
      
      return !businessesWithNumbers.has(normalized);
    });
    
    if (orphanedVapiNumbers.length > 0) {
      console.log(`   ⚠️  Found ${orphanedVapiNumbers.length} numbers in VAPI not assigned to any business:`);
      orphanedVapiNumbers.forEach((num, idx) => {
        const phone = num.phoneNumber || num.phone_number || num.number;
        const assistantId = num.assistantId || num.assistant?.id;
        console.log(`   ${idx + 1}. ${phone} (Assistant: ${assistantId || 'None'}) - AVAILABLE FOR ASSIGNMENT`);
      });
    } else {
      console.log('   ✅ All VAPI numbers are assigned to businesses');
    }
    
    // Summary
    console.log('\n📊 SUMMARY:');
    console.log(`   - Unassigned in Telnyx: ${unassignedNumbers.length}`);
    console.log(`   - Provisioned in VAPI: ${vapiNumbers.length}`);
    console.log(`   - Assigned to businesses: ${businesses.length}`);
    console.log(`   - Orphaned in VAPI: ${orphanedVapiNumbers.length}`);
    
    if (orphanedVapiNumbers.length > 0) {
      console.log('\n💡 TIP: Orphaned numbers in VAPI can be automatically assigned to new businesses during signup.');
      console.log('   They will be reused instead of purchasing new numbers.');
    }
    
    if (unassignedNumbers.length > 0) {
      console.log('\n💡 TIP: Unassigned numbers in Telnyx will be automatically assigned to new businesses during signup.');
    }
    
    console.log('\n✅ Check complete!\n');
    
  } catch (error) {
    console.error('❌ Error checking phone numbers:', error);
    process.exit(1);
  }
}

checkAndReportPhoneNumbers().then(() => {
  process.exit(0);
});
















