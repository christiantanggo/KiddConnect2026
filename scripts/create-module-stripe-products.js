/**
 * Create Stripe Products and Prices for Modules
 * 
 * This script creates Stripe products and prices for all active modules
 * and stores the product/price IDs in the modules.metadata field.
 * 
 * Usage:
 *   node scripts/create-module-stripe-products.js
 * 
 * Environment Variables Required:
 *   - STRIPE_SECRET_KEY (or STRIPE_SECRET_KEY_TEST/STRIPE_SECRET_KEY_LIVE)
 *   - DATABASE_URL
 */

import dotenv from 'dotenv';
import Stripe from 'stripe';
import { supabaseClient } from '../config/database.js';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY_TEST || process.env.STRIPE_SECRET_KEY_LIVE, {
  apiVersion: '2024-12-18.acacia',
});

async function createModuleStripeProducts() {
  console.log('🚀 Creating Stripe products and prices for modules...\n');

  try {
    // Get all active modules
    const { data: modules, error } = await supabaseClient
      .from('modules')
      .select('*')
      .eq('is_active', true);

    if (error) {
      throw error;
    }

    if (!modules || modules.length === 0) {
      console.log('⚠️  No active modules found.');
      return;
    }

    console.log(`Found ${modules.length} active module(s):\n`);

    for (const module of modules) {
      console.log(`Processing module: ${module.name} (${module.key})`);
      
      // Get pricing from metadata
      const pricing = module.metadata?.pricing || {
        monthly_price_cents: 2900, // Default $29.00
        currency: 'usd',
        usage_limit: 100,
        interval: 'month'
      };

      // Check if product already exists in Stripe
      let productId = module.metadata?.stripe_product_id;
      let priceId = module.metadata?.stripe_price_id;

      // If product ID exists, verify it's still valid
      if (productId) {
        try {
          await stripe.products.retrieve(productId);
          console.log(`  ✓ Product already exists: ${productId}`);
        } catch (error) {
          if (error.code === 'resource_missing') {
            console.log(`  ⚠️  Product ${productId} not found in Stripe, creating new one...`);
            productId = null;
            priceId = null;
          } else {
            throw error;
          }
        }
      }

      // Create product if doesn't exist
      if (!productId) {
        const product = await stripe.products.create({
          name: module.name,
          description: module.description,
          metadata: {
            module_key: module.key,
            version: module.version || '1.0.0',
          },
        });
        productId = product.id;
        console.log(`  ✓ Created product: ${productId}`);
      }

      // Check if price exists and matches
      if (priceId) {
        try {
          const existingPrice = await stripe.prices.retrieve(priceId);
          // Check if price matches
          if (existingPrice.unit_amount === pricing.monthly_price_cents &&
              existingPrice.currency === pricing.currency &&
              existingPrice.recurring?.interval === 'month') {
            console.log(`  ✓ Price already exists and matches: ${priceId}`);
          } else {
            console.log(`  ⚠️  Price ${priceId} exists but doesn't match, creating new one...`);
            priceId = null;
          }
        } catch (error) {
          if (error.code === 'resource_missing') {
            console.log(`  ⚠️  Price ${priceId} not found in Stripe, creating new one...`);
            priceId = null;
          } else {
            throw error;
          }
        }
      }

      // Create price if doesn't exist
      if (!priceId) {
        const price = await stripe.prices.create({
          product: productId,
          unit_amount: pricing.monthly_price_cents,
          currency: pricing.currency,
          recurring: {
            interval: pricing.interval || 'month',
          },
          metadata: {
            module_key: module.key,
          },
        });
        priceId = price.id;
        console.log(`  ✓ Created price: ${priceId} (${(pricing.monthly_price_cents / 100).toFixed(2)} ${pricing.currency.toUpperCase()}/month)`);
      }

      // Update module metadata with product/price IDs
      const updatedMetadata = {
        ...module.metadata,
        stripe_product_id: productId,
        stripe_price_id: priceId,
        pricing: pricing
      };

      const { error: updateError } = await supabaseClient
        .from('modules')
        .update({
          metadata: updatedMetadata,
          updated_at: new Date().toISOString()
        })
        .eq('id', module.id);

      if (updateError) {
        throw updateError;
      }

      console.log(`  ✓ Updated module metadata with Stripe IDs\n`);
    }

    console.log('✅ Successfully created/updated Stripe products and prices for all modules!');
    console.log('\n💡 Tip: Store these product/price IDs in environment variables if needed:');
    console.log('   STRIPE_PRODUCT_ID_REVIEWS=prod_xxxxx');
    console.log('   STRIPE_PRICE_ID_REVIEWS=price_xxxxx');

  } catch (error) {
    console.error('\n❌ Error creating Stripe products:', error);
    process.exit(1);
  }
}

// Run script
createModuleStripeProducts();


