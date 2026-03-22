// Check if Stripe webhook is configured
import dotenv from 'dotenv';
import { getStripeInstance } from '../services/stripe.js';

dotenv.config();

async function checkStripeWebhookConfig() {
  console.log('\n' + '='.repeat(60));
  console.log('🔍 CHECKING STRIPE WEBHOOK CONFIGURATION');
  console.log('='.repeat(60) + '\n');

  try {
    const stripe = getStripeInstance();
    
    // Get all webhook endpoints
    const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
    
    const expectedUrl = process.env.BACKEND_URL || 
                       process.env.RAILWAY_PUBLIC_DOMAIN || 
                       process.env.VERCEL_URL || 
                       process.env.SERVER_URL ||
                       'https://api.tavarios.com';
    
    const expectedWebhookUrl = `${expectedUrl}/api/billing/webhook`;
    
    console.log(`Expected webhook URL: ${expectedWebhookUrl}\n`);
    
    if (endpoints.data.length === 0) {
      console.log('❌ NO WEBHOOK ENDPOINTS CONFIGURED IN STRIPE');
      console.log('');
      console.log('⚠️  THIS IS THE PROBLEM! Stripe cannot send webhooks without an endpoint configured.');
      console.log('');
      console.log('📋 TO FIX THIS:');
      console.log('1. Go to Stripe Dashboard: https://dashboard.stripe.com/webhooks');
      console.log('2. Click "Add endpoint"');
      console.log(`3. Enter endpoint URL: ${expectedWebhookUrl}`);
      console.log('4. Select events to listen to:');
      console.log('   - checkout.session.completed');
      console.log('   - customer.subscription.created');
      console.log('   - customer.subscription.updated');
      console.log('   - customer.subscription.deleted');
      console.log('   - invoice.payment_succeeded');
      console.log('   - invoice.payment_failed');
      console.log('5. Copy the "Signing secret" (starts with whsec_)');
      console.log(`6. Set STRIPE_WEBHOOK_SECRET in your .env file`);
      console.log('');
      return;
    }
    
    console.log(`Found ${endpoints.data.length} webhook endpoint(s):\n`);
    
    let foundMatch = false;
    endpoints.data.forEach((endpoint, index) => {
      const isMatch = endpoint.url === expectedWebhookUrl;
      foundMatch = foundMatch || isMatch;
      
      console.log(`${index + 1}. ${endpoint.url}`);
      console.log(`   Status: ${endpoint.status}`);
      console.log(`   ID: ${endpoint.id}`);
      console.log(`   Events (${endpoint.enabled_events.length}): ${endpoint.enabled_events.slice(0, 5).join(', ')}${endpoint.enabled_events.length > 5 ? '...' : ''}`);
      if (isMatch) {
        console.log(`   ✅ This matches the expected URL`);
      } else {
        console.log(`   ⚠️  This does NOT match the expected URL`);
      }
      console.log('');
    });
    
    if (!foundMatch) {
      console.log('❌ NO MATCHING WEBHOOK ENDPOINT FOUND');
      console.log('');
      console.log(`Expected URL: ${expectedWebhookUrl}`);
      console.log('But found different URL(s) in Stripe Dashboard');
      console.log('');
      console.log('📋 TO FIX THIS:');
      console.log(`1. Go to Stripe Dashboard: https://dashboard.stripe.com/webhooks`);
      console.log(`2. Either update an existing endpoint to: ${expectedWebhookUrl}`);
      console.log(`   OR create a new endpoint with URL: ${expectedWebhookUrl}`);
      console.log('');
    } else {
      console.log('✅ Webhook endpoint is configured correctly!');
      console.log('');
      console.log('⚠️  BUT: Make sure STRIPE_WEBHOOK_SECRET is set in your .env file');
      console.log('   You can find it in Stripe Dashboard > Webhooks > Click endpoint > Signing secret');
      console.log('');
    }
    
    // Check if webhook secret is configured
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.log('❌ STRIPE_WEBHOOK_SECRET is NOT set in environment variables');
      console.log('   This means webhook signature verification will be skipped');
      console.log('   ⚠️  This is OK for development but NOT secure for production');
      console.log('');
    } else {
      console.log('✅ STRIPE_WEBHOOK_SECRET is configured');
      console.log('');
    }
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

checkStripeWebhookConfig();

