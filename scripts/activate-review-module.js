import 'dotenv/config';
import { supabaseClient } from '../config/database.js';
import { User } from '../models/User.js';
import { Business } from '../models/Business.js';
import { Subscription } from '../models/v2/Subscription.js';
import { calculateBillingCycle } from '../services/billing.js';

const email = process.argv[2] || 'test@tavarios.com';

async function activateReviewModule() {
  try {
    console.log(`\n🔄 Activating review module for: ${email}\n`);

    // Find user by email
    const user = await User.findByEmail(email);
    if (!user) {
      console.error('❌ User not found:', email);
      process.exit(1);
    }

    console.log(`✅ Found user: ${user.email}`);

    // Get business
    const business = await Business.findById(user.business_id);
    if (!business) {
      console.error('❌ Business not found for user');
      process.exit(1);
    }

    console.log(`✅ Found business: ${business.name} (ID: ${business.id})`);

    // Check if subscription already exists
    const existingSubscription = await Subscription.findByBusinessAndModule(business.id, 'reviews');
    if (existingSubscription && ['active', 'trialing', 'past_due'].includes(existingSubscription.status)) {
      console.log('⚠️  Review module already activated for this business');
      console.log(`   Status: ${existingSubscription.status}`);
      console.log(`   Subscription ID: ${existingSubscription.id}\n`);
      process.exit(0);
    }

    // Calculate billing cycle
    const billingCycle = calculateBillingCycle(business);
    const resetDate = new Date(billingCycle.end);
    resetDate.setDate(resetDate.getDate() + 1); // Next day after cycle ends

    // Create test subscription (similar to test mode in activation endpoint)
    console.log('📝 Creating subscription...');
    const subscription = await Subscription.create({
      business_id: business.id,
      module_key: 'reviews',
      plan: 'test', // Mark as test subscription
      status: 'active',
      stripe_subscription_item_id: `test_${business.id}_reviews_${Date.now()}`, // Fake Stripe ID for test
      usage_limit: 100, // Default usage limit
      usage_limit_reset_date: resetDate.toISOString().split('T')[0],
      started_at: new Date().toISOString(),
    });

    console.log('✅ Review module activated successfully!');
    console.log(`\nSubscription ID: ${subscription.id}`);
    console.log(`Module: reviews`);
    console.log(`Status: ${subscription.status}`);
    console.log(`Plan: ${subscription.plan}`);
    console.log(`Usage Limit: ${subscription.usage_limit || 'unlimited'}`);
    console.log(`Usage Reset Date: ${subscription.usage_limit_reset_date}\n`);
  } catch (error) {
    console.error('❌ Error:', error);
    if (error.message) {
      console.error('   Message:', error.message);
    }
    if (error.code) {
      console.error('   Code:', error.code);
    }
    if (error.details) {
      console.error('   Details:', error.details);
    }
    process.exit(1);
  }
}

activateReviewModule();




