// services/stripe.js
// Stripe payment processing service

import Stripe from 'stripe';
import dotenv from 'dotenv';
import { Business } from '../models/Business.js';
import { PricingPackage } from '../models/PricingPackage.js';

dotenv.config();

// Get Stripe instance based on mode
// Supports both separate test/live keys and single key (backward compatible)
function createStripeInstance() {
  const mode = process.env.STRIPE_MODE?.toLowerCase() || 'auto'; // 'test', 'live', or 'auto'
  
  let secretKey;
  
  if (mode === 'test') {
    // Use test keys
    secretKey = process.env.STRIPE_SECRET_KEY_TEST || process.env.STRIPE_SECRET_KEY;
  } else if (mode === 'live') {
    // Use live keys
    secretKey = process.env.STRIPE_SECRET_KEY_LIVE || process.env.STRIPE_SECRET_KEY;
  } else {
    // Auto-detect based on key prefix (backward compatible)
    const testKey = process.env.STRIPE_SECRET_KEY_TEST;
    const liveKey = process.env.STRIPE_SECRET_KEY_LIVE;
    const singleKey = process.env.STRIPE_SECRET_KEY;
    
    if (testKey && liveKey) {
      // Both keys exist, default to test for safety
      console.warn('[StripeService] Both test and live keys found, but STRIPE_MODE not set. Defaulting to test mode.');
      secretKey = testKey;
    } else if (testKey) {
      secretKey = testKey;
    } else if (liveKey) {
      secretKey = liveKey;
    } else {
      secretKey = singleKey;
    }
  }
  
  if (!secretKey) {
    console.warn('[StripeService] ⚠️ Stripe secret key not configured. Stripe features will not work.');
    console.warn('[StripeService] Set STRIPE_SECRET_KEY, STRIPE_SECRET_KEY_TEST, or STRIPE_SECRET_KEY_LIVE environment variable.');
    return null; // Return null instead of creating instance
  }
  
  return new Stripe(secretKey, {
    apiVersion: '2024-12-18.acacia',
  });
}

// Export function to get Stripe instance (for use in routes)
// Lazy-loaded to prevent server crash if Stripe keys aren't configured
let stripeInstance = null;

export function getStripeInstance() {
  if (stripeInstance === null) {
    stripeInstance = createStripeInstance();
  }
  if (!stripeInstance) {
    throw new Error('Stripe is not configured. Please set STRIPE_SECRET_KEY, STRIPE_SECRET_KEY_TEST, or STRIPE_SECRET_KEY_LIVE environment variable.');
  }
  return stripeInstance;
}

// Get the default Stripe instance (lazy-loaded)
function getStripe() {
  return getStripeInstance();
}

// Helper to check if we're in test mode
export function isStripeTestMode() {
  const mode = process.env.STRIPE_MODE?.toLowerCase() || 'auto';
  
  if (mode === 'test') {
    return true;
  } else if (mode === 'live') {
    return false;
  } else {
    // Auto-detect
    const secretKey = process.env.STRIPE_SECRET_KEY_TEST || 
                     process.env.STRIPE_SECRET_KEY_LIVE || 
                     process.env.STRIPE_SECRET_KEY;
    return secretKey?.startsWith('sk_test_') || false;
  }
}

export class StripeService {
  // Create a checkout session for a package
  static async createCheckoutSession(businessId, packageId, packagePrice, packageName, successUrl, cancelUrl, saleName = null, salePriceExpiresAt = null) {
    try {
      const business = await Business.findById(businessId);
      if (!business) {
        throw new Error('Business not found');
      }

      // Get package to check for existing Stripe price ID
      const pkg = await PricingPackage.findById(packageId);
      if (!pkg) {
        throw new Error('Package not found');
      }

      // Create or get Stripe customer
      let customerId = business.stripe_customer_id;
      
      if (!customerId) {
        // Create new Stripe customer
        const stripe = getStripe();
        const customer = await stripe.customers.create({
          email: business.email,
          name: business.name,
          phone: business.phone,
          metadata: {
            business_id: businessId,
          },
        });
        customerId = customer.id;
        
        // Save customer ID to business
        await Business.update(businessId, {
          stripe_customer_id: customerId,
        });
      }

      // ALWAYS use price_data for subscriptions to ensure correct price
      // This avoids issues with stale price IDs and ensures database price matches Stripe
      
      // Get or create product ID (needed for price_data)
      let productId = pkg.stripe_product_id;
      if (productId) {
        try {
          const stripe = getStripe();
          await stripe.products.retrieve(productId);
          console.log('[StripeService] Using existing Stripe product:', productId);
        } catch (error) {
          console.warn('[StripeService] Stored product ID does not exist, creating new product');
          productId = null;
        }
      }
      
      if (!productId) {
        const stripe = getStripe();
        const product = await stripe.products.create({
          name: packageName,
          description: pkg.description || `Monthly subscription for ${packageName}`,
          metadata: {
            package_id: packageId,
          },
        });
        productId = product.id;
        
        // Save product ID to database
        await PricingPackage.update(packageId, {
          stripe_product_id: productId,
        });
        
        console.log('[StripeService] Created new Stripe product:', productId);
      }

      // Create checkout session - ALWAYS use price_data to ensure correct price
      const stripe = getStripe();
      
      // Get invoice settings for tax rate
      const { InvoiceSettings } = await import('../models/InvoiceSettings.js');
      const invoiceSettings = await InvoiceSettings.get();
      const taxRate = invoiceSettings?.tax_rate || 0.13;
      
      // Calculate total with tax (Tavari controls taxes, not Stripe)
      const subtotal = packagePrice;
      const taxAmount = subtotal * taxRate;
      const totalWithTax = subtotal + taxAmount;
      
      // Validate price is valid
      if (!packagePrice || packagePrice <= 0) {
        throw new Error(`Invalid package price: ${packagePrice}. Price must be greater than 0.`);
      }
      
      // Stripe minimum charge amounts by currency (check against total with tax)
      // For CAD, minimum is $0.50 for one-time payments and subscriptions
      const MINIMUM_AMOUNTS = {
        cad: 0.50,
        usd: 0.50,
        eur: 0.50,
        gbp: 0.30,
      };
      
      const currency = 'cad'; // Currently only supporting CAD
      const minimumAmount = MINIMUM_AMOUNTS[currency.toLowerCase()] || 0.50;
      
      if (totalWithTax < minimumAmount) {
        throw new Error(
          `Total amount with tax ($${totalWithTax.toFixed(2)} ${currency.toUpperCase()}) is below Stripe's minimum charge amount of $${minimumAmount.toFixed(2)} ${currency.toUpperCase()}. ` +
          `Stripe will reject payments below this amount. Please set a valid package price.`
        );
      }
      
      const lineItems = [{
        price_data: {
          currency: 'cad',
          product: productId,
          unit_amount: Math.round(totalWithTax * 100), // Convert to cents - charge total WITH tax
          recurring: {
            interval: 'month',
          },
        },
        quantity: 1,
      }];
      
      console.log('[StripeService] Using price_data with Tavari tax calculation:');
      console.log('[StripeService] - Subtotal:', subtotal.toFixed(2), 'CAD');
      console.log('[StripeService] - Tax Rate:', (taxRate * 100).toFixed(2), '%');
      console.log('[StripeService] - Tax Amount:', taxAmount.toFixed(2), 'CAD');
      console.log('[StripeService] - Total (with tax):', totalWithTax.toFixed(2), 'CAD (', Math.round(totalWithTax * 100), 'cents)');
      
      console.log('[StripeService] Creating checkout session with:');
      console.log('[StripeService] - customer:', customerId);
      console.log('[StripeService] - line_items:', JSON.stringify(lineItems, null, 2));
      console.log('[StripeService] - mode: subscription');
      console.log('[StripeService] - automatic_tax: disabled (Tavari controls taxes)');
      console.log('[StripeService] - metadata:', {
        business_id: businessId,
        package_id: packageId,
        sale_name: saleName || '',
        sale_price_expires_at: salePriceExpiresAt || '',
      });
      
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: lineItems,
        mode: 'subscription', // This creates a recurring subscription automatically
        automatic_tax: { enabled: false }, // Disable Stripe automatic tax - Tavari controls taxes
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          business_id: businessId,
          package_id: packageId,
          sale_name: saleName || '',
          sale_price_expires_at: salePriceExpiresAt || '',
        },
        subscription_data: {
          metadata: {
            business_id: businessId,
            package_id: packageId,
          },
        },
      });
      
      console.log('[StripeService] ✅ Checkout session created:', session.id);
      console.log('[StripeService] Checkout URL:', session.url);
      console.log('[StripeService] Payment status:', session.payment_status);

      return {
        sessionId: session.id,
        url: session.url,
        customerId: customerId,
      };
    } catch (error) {
      console.error('[StripeService] Error creating checkout session:', error);
      throw error;
    }
  }

  // Handle webhook events
  static async handleWebhook(event) {
    try {
      const eventType = event.type;
      const data = event.data.object;

      switch (eventType) {
        case 'checkout.session.completed':
          await this.handleCheckoutCompleted(data);
          break;
        
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdate(data);
          break;
        
        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(data);
          break;
        
        case 'invoice.payment_succeeded':
          await this.handlePaymentSucceeded(data);
          break;
        
        case 'invoice.payment_failed':
          await this.handlePaymentFailed(data);
          break;
        
        default:
          console.log(`[StripeService] Unhandled event type: ${eventType}`);
      }
    } catch (error) {
      console.error('[StripeService] Error handling webhook:', error);
      throw error;
    }
  }

  // Handle checkout completed
  static async handleCheckoutCompleted(session) {
    console.log('[StripeService] ========== HANDLING CHECKOUT COMPLETED ==========');
    console.log('[StripeService] Session ID:', session.id);
    console.log('[StripeService] Session metadata:', JSON.stringify(session.metadata, null, 2));
    console.log('[StripeService] Subscription ID:', session.subscription);
    console.log('[StripeService] Payment status:', session.payment_status);
    console.log('[StripeService] Amount total:', session.amount_total);
    
    let businessId = session.metadata?.business_id;
    const packageId = session.metadata?.package_id;
    const saleName = session.metadata?.sale_name;
    const salePriceExpiresAt = session.metadata?.sale_price_expires_at;

    if (!packageId) {
      console.error('[StripeService] ❌ Missing package ID in checkout session metadata');
      return;
    }

    if (!businessId && !session.customer) {
      console.error('[StripeService] ❌ Missing both business_id in metadata and customer ID in session');
      return;
    }

    console.log('[StripeService] Business ID from metadata:', businessId);
    console.log('[StripeService] Customer ID from session:', session.customer);
    console.log('[StripeService] Package ID:', packageId);

    // Try to find business by metadata business_id first (if provided)
    let business = null;
    if (businessId) {
      business = await Business.findById(businessId);
    }
    
    // If not found by ID, try to find by Stripe customer ID as fallback
    if (!business && session.customer) {
      console.warn('[StripeService] ⚠️  Business not found by ID, trying to find by Stripe customer ID:', session.customer);
      business = await Business.findByStripeCustomerId(session.customer);
      if (business) {
        console.log('[StripeService] ✅ Found business by Stripe customer ID:', business.id);
        // Update businessId to the correct one from the database
        businessId = business.id;
      }
    }
    
    if (!business) {
      console.error('[StripeService] ❌ Business not found by ID:', businessId);
      if (session.customer) {
        console.error('[StripeService] ❌ Business also not found by Stripe customer ID:', session.customer);
      }
      console.error('[StripeService] Cannot update business - business does not exist in database');
      return;
    }

    // Get package details to update plan_tier and usage_limit_minutes
    const { PricingPackage } = await import('../models/PricingPackage.js');
    const pkg = await PricingPackage.findById(packageId);
    
    if (!pkg) {
      console.error('[StripeService] ❌ Package not found:', packageId);
      return;
    }
    
    console.log('[StripeService] Package found:', pkg.name);
    console.log('[StripeService] Package minutes included:', pkg.minutes_included);

    // Use sale info from metadata (more reliable than recalculating)
    const isOnSale = !!(saleName && saleName.trim() !== '');

    // Update business with subscription info
    let subscriptionId = session.subscription;
    
    // If subscription ID is a string, use it directly; if it's an object, extract the ID
    if (typeof subscriptionId === 'object' && subscriptionId !== null) {
      subscriptionId = subscriptionId.id;
    }
    
    // If still no subscription ID, try to retrieve the session again to get the latest data
    if (!subscriptionId) {
      console.warn('[StripeService] ⚠️  No subscription ID in checkout session, retrieving session from Stripe...');
      try {
        const stripe = getStripe();
        const retrievedSession = await stripe.checkout.sessions.retrieve(session.id, {
          expand: ['subscription'],
        });
        subscriptionId = retrievedSession.subscription;
        
        if (typeof subscriptionId === 'object' && subscriptionId !== null) {
          subscriptionId = subscriptionId.id;
        }
        
        if (subscriptionId) {
          console.log('[StripeService] ✅ Found subscription ID after retrieval:', subscriptionId);
        } else {
          console.error('[StripeService] ❌ No subscription ID found even after retrieving session');
          console.error('[StripeService] Retrieved session:', JSON.stringify(retrievedSession, null, 2));
          return;
        }
      } catch (retrieveError) {
        console.error('[StripeService] ❌ Error retrieving session from Stripe:', retrieveError);
        return;
      }
    }
    
    console.log('[StripeService] ✅ Subscription ID found:', subscriptionId);
    
    const updateData = {
      stripe_subscription_id: subscriptionId,
      stripe_subscription_status: 'active',
      package_id: packageId,
    };

    // If package found, update plan tier and usage limit
    if (pkg) {
      updateData.plan_tier = pkg.name.toLowerCase();
      updateData.usage_limit_minutes = pkg.minutes_included;
      
      console.log('[StripeService] Updating business with:');
      console.log('[StripeService] - plan_tier:', updateData.plan_tier);
      console.log('[StripeService] - usage_limit_minutes:', updateData.usage_limit_minutes);
      
      // Track sale purchase details if on sale (use metadata values)
      if (isOnSale) {
        // Get the actual amount charged from the session (most accurate)
        const amountCharged = session.amount_total ? session.amount_total / 100 : null;
        if (amountCharged) {
          updateData.purchased_at_sale_price = amountCharged;
          console.log('[StripeService] Sale price charged:', amountCharged);
        }
        updateData.sale_price_expires_at = salePriceExpiresAt && salePriceExpiresAt.trim() !== '' ? salePriceExpiresAt : null;
        updateData.sale_name = saleName;
        console.log('[StripeService] Sale name:', saleName);
        console.log('[StripeService] Sale price expires at:', updateData.sale_price_expires_at);
      }
    }

    console.log('[StripeService] Final update data:', JSON.stringify(updateData, null, 2));
    
    const updatedBusiness = await Business.update(businessId, updateData);
    
    console.log('[StripeService] ✅ Business updated successfully');
    console.log('[StripeService] Updated business plan_tier:', updatedBusiness.plan_tier);
    console.log('[StripeService] Updated business usage_limit_minutes:', updatedBusiness.usage_limit_minutes);
    console.log('[StripeService] Updated business package_id:', updatedBusiness.package_id);
    
    // Increment sale count if package is on sale
    if (isOnSale && pkg) {
      await PricingPackage.incrementSaleCount(packageId);
      console.log('[StripeService] ✅ Incremented sale count for package:', packageId);
    }
    
    // Create invoice for the initial payment
    try {
      const amountCharged = session.amount_total ? session.amount_total / 100 : pkg.monthly_price;
      
      // Try to get the Stripe invoice ID from the session
      let stripeInvoiceId = null;
      if (session.invoice) {
        stripeInvoiceId = typeof session.invoice === 'string' ? session.invoice : session.invoice.id;
      }
      
      const { generateInvoiceNumber } = await import('../services/invoices.js');
      const { InvoiceSettings } = await import('../models/InvoiceSettings.js');
      
      // Get invoice settings for tax rate
      const invoiceSettings = await InvoiceSettings.get();
      const taxRate = invoiceSettings?.tax_rate || 0.13;
      
      // Calculate subtotal and tax (assume amountCharged includes tax)
      // If Stripe already calculated tax, we might need to extract it
      // For now, calculate backwards from total
      const subtotal = amountCharged / (1 + taxRate);
      const taxAmount = amountCharged - subtotal;
      
      // Generate invoice number
      const invoiceNumber = await generateInvoiceNumber(businessId);
      
      // Create invoice record directly (simpler than using generateInvoice which requires PDF)
      const { supabaseClient } = await import('../config/database.js');
      const { data: createdInvoice, error: invoiceError } = await supabaseClient
        .from('invoices')
        .insert({
          business_id: businessId,
          invoice_number: invoiceNumber,
          stripe_invoice_id: stripeInvoiceId,
          subtotal: subtotal,
          tax_rate: taxRate,
          tax_amount: taxAmount,
          amount: amountCharged, // Total including tax
          currency: 'cad',
          invoice_type: 'subscription_setup',
          status: 'paid',
          paid_at: new Date().toISOString(),
        })
        .select()
        .single();
      
      if (invoiceError) {
        throw invoiceError;
      }
      
      console.log('[StripeService] ✅ Invoice created for initial payment:', createdInvoice.invoice_number);
    } catch (invoiceError) {
      // Don't fail the whole process if invoice creation fails
      console.error('[StripeService] ⚠️ Failed to create invoice:', invoiceError.message);
      console.error('[StripeService] Invoice error details:', invoiceError);
    }
    
    console.log(`[StripeService] ✅ Business ${businessId} updated with subscription ${subscriptionId}`);
    console.log('[StripeService] ================================================');
  }

  // Handle subscription update
  static async handleSubscriptionUpdate(subscription) {
    const customerId = subscription.customer;
    
    // Find business by Stripe customer ID using Business model method
    const business = await Business.findByStripeCustomerId(customerId);

    if (!business) {
      console.warn('[StripeService] Business not found for customer:', customerId);
      return;
    }

    const businessId = business.id;
    const status = subscription.status;

    // Get package ID from subscription metadata or line items if available
    const packageId = subscription.metadata?.package_id;
    
    const updateData = {
      stripe_subscription_id: subscription.id,
      stripe_subscription_status: status,
    };

    // If package_id is in metadata, update it
    if (packageId) {
      updateData.package_id = packageId;
    }

    // Update subscription status
    await Business.update(businessId, updateData);
  }

  // Handle subscription deleted
  static async handleSubscriptionDeleted(subscription) {
    const customerId = subscription.customer;
    
    // Find business by Stripe customer ID using Business model method
    const business = await Business.findByStripeCustomerId(customerId);

    if (!business) {
      console.warn('[StripeService] Business not found for customer:', customerId);
      return;
    }

    const businessId = business.id;

    // Clear subscription info
    await Business.update(businessId, {
      stripe_subscription_id: null,
      stripe_subscription_status: 'canceled',
    });
  }

  // Handle payment succeeded
  static async handlePaymentSucceeded(invoice) {
    console.log('[StripeService] Payment succeeded for invoice:', invoice.id);
    
    try {
      const subscriptionId = invoice.subscription;
      if (!subscriptionId) {
        // One-time payment, not a subscription
        return;
      }

      // Get subscription to find customer
      const stripe = getStripe();
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const customerId = subscription.customer;

      // Find business by Stripe customer ID
      const business = await Business.findByStripeCustomerId(customerId);
      if (!business) {
        console.warn('[StripeService] Business not found for customer:', customerId);
        return;
      }

      const businessId = business.id;

      // Create invoice record for this payment (recurring payment)
      try {
        const amountCharged = invoice.amount_paid ? invoice.amount_paid / 100 : (invoice.amount_due / 100);
        const { supabaseClient } = await import('../config/database.js');
        
        // Check if invoice already exists to avoid duplicates
        const { data: existingInvoice } = await supabaseClient
          .from('invoices')
          .select('id')
          .eq('stripe_invoice_id', invoice.id)
          .single();
        
        if (!existingInvoice) {
          const { generateInvoiceNumber } = await import('../services/invoices.js');
          const { InvoiceSettings } = await import('../models/InvoiceSettings.js');
          
          // Get invoice settings for tax rate
          const invoiceSettings = await InvoiceSettings.get();
          const taxRate = invoiceSettings?.tax_rate || 0.13;
          
          // Calculate subtotal and tax
          // Since we charge totalWithTax in Stripe, amountCharged includes tax
          const subtotal = amountCharged / (1 + taxRate);
          const taxAmount = amountCharged - subtotal;
          
          // Generate invoice number
          const invoiceNumber = await generateInvoiceNumber(businessId);
          
          const { data: createdInvoice, error: invoiceError } = await supabaseClient
            .from('invoices')
            .insert({
              business_id: businessId,
              invoice_number: invoiceNumber,
              stripe_invoice_id: invoice.id,
              subtotal: subtotal,
              tax_rate: taxRate,
              tax_amount: taxAmount,
              amount: amountCharged, // Total including tax
              currency: invoice.currency || 'cad',
              invoice_type: 'subscription_recurring',
              period_start: invoice.period_start ? new Date(invoice.period_start * 1000).toISOString().split('T')[0] : null,
              period_end: invoice.period_end ? new Date(invoice.period_end * 1000).toISOString().split('T')[0] : null,
              status: 'paid',
              paid_at: new Date().toISOString(),
            })
            .select()
            .single();
          
          if (invoiceError) {
            throw invoiceError;
          }
          
          console.log('[StripeService] ✅ Invoice created for recurring payment:', createdInvoice.invoice_number);
        } else {
          console.log('[StripeService] Invoice already exists for Stripe invoice:', invoice.id);
        }
      } catch (invoiceError) {
        console.error('[StripeService] ⚠️ Failed to create invoice for recurring payment:', invoiceError.message);
      }

      // Check if sale price has expired and update subscription if needed
      if (business.sale_price_expires_at && business.package_id) {
        const expirationDate = new Date(business.sale_price_expires_at);
        const now = new Date();
        expirationDate.setHours(23, 59, 59, 999); // End of expiration day

        if (now > expirationDate) {
          // Sale has expired - update subscription to regular price
          console.log(`[StripeService] Sale price expired for business ${business.id}, updating subscription to regular price`);
          
          const { PricingPackage } = await import('../models/PricingPackage.js');
          const pkg = await PricingPackage.findById(business.package_id);
          
          if (!pkg) {
            console.warn(`[StripeService] Package not found for business ${business.id}`);
            return;
          }

          // Use helper function to update subscription
          await this.updateSubscriptionToRegularPrice(
            subscriptionId,
            business.id,
            business.package_id,
            pkg.monthly_price
          );

          // Clear sale fields from business record
          await Business.update(business.id, {
            sale_price_expires_at: null,
            sale_name: null,
            purchased_at_sale_price: null,
          });

          console.log(`[StripeService] ✅ Cleared sale fields for business ${business.id}`);
        }
      }
    } catch (error) {
      console.error('[StripeService] Error in handlePaymentSucceeded:', error);
      // Don't throw - payment succeeded, this is just a cleanup task
    }
  }

  // Handle payment failed
  static async handlePaymentFailed(invoice) {
    console.log('[StripeService] Payment failed for invoice:', invoice.id);
    // Could implement grace period logic here
  }

  // Cancel subscription
  static async cancelSubscription(subscriptionId) {
    try {
      const stripe = getStripe();
      const subscription = await stripe.subscriptions.cancel(subscriptionId);
      return subscription;
    } catch (error) {
      console.error('[StripeService] Error canceling subscription:', error);
      throw error;
    }
  }

  // Get subscription details
  static async getSubscription(subscriptionId) {
    try {
      const stripe = getStripe();
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      return subscription;
    } catch (error) {
      console.error('[StripeService] Error retrieving subscription:', error);
      throw error;
    }
  }

  /**
   * Check and update subscriptions with expired sale prices
   * Should be called periodically (e.g., daily) to proactively update subscriptions
   */
  static async updateExpiredSalePrices() {
    try {
      const { supabaseClient } = await import('../config/database.js');
      const { PricingPackage } = await import('../models/PricingPackage.js');
      
      console.log('[StripeService] Checking for expired sale prices...');
      
      // Find businesses with expired sale prices that have active Stripe subscriptions
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
      
      const { data: businesses, error } = await supabaseClient
        .from('businesses')
        .select('id, sale_price_expires_at, package_id, stripe_subscription_id')
        .not('sale_price_expires_at', 'is', null)
        .not('stripe_subscription_id', 'is', null)
        .is('deleted_at', null);
      
      if (error) {
        console.error('[StripeService] Error finding businesses with expired sale prices:', error);
        return;
      }

      let updatedCount = 0;
      let errorCount = 0;

      for (const business of businesses || []) {
        try {
          const expirationDate = new Date(business.sale_price_expires_at);
          const expirationDateStr = expirationDate.toISOString().split('T')[0];
          
          // Check if sale has expired (expiration date is today or in the past)
          if (expirationDateStr <= todayStr) {
            console.log(`[StripeService] Sale price expired for business ${business.id}, updating subscription...`);
            
            // Get package details
            const pkg = await PricingPackage.findById(business.package_id);
            if (!pkg) {
              console.warn(`[StripeService] Package not found for business ${business.id}`);
              continue;
            }

            const regularPrice = pkg.monthly_price;
            
            // Update subscription price
            await this.updateSubscriptionToRegularPrice(
              business.stripe_subscription_id,
              business.id,
              business.package_id,
              regularPrice
            );
            
            // Clear sale fields from business record
            await Business.update(business.id, {
              sale_price_expires_at: null,
              sale_name: null,
              purchased_at_sale_price: null,
            });
            
            updatedCount++;
            console.log(`[StripeService] ✅ Updated business ${business.id} to regular price: ${regularPrice} CAD/month`);
          }
        } catch (error) {
          console.error(`[StripeService] Error updating business ${business.id}:`, error.message);
          errorCount++;
        }
      }

      console.log(`[StripeService] ✅ Updated ${updatedCount} subscriptions, ${errorCount} errors`);
    } catch (error) {
      console.error('[StripeService] Error in updateExpiredSalePrices:', error);
    }
  }

  /**
   * Update a Stripe subscription to use the regular (non-sale) price
   * Helper method used by both invoice handler and scheduled job
   */
  static async updateSubscriptionToRegularPrice(subscriptionId, businessId, packageId, regularPrice) {
    const stripe = getStripe();
    const { PricingPackage } = await import('../models/PricingPackage.js');
    
    // Get or create the regular price ID
    const pkg = await PricingPackage.findById(packageId);
    if (!pkg) {
      throw new Error(`Package ${packageId} not found`);
    }

    let regularPriceId = pkg.stripe_price_id;
    
    // Check if the stored price ID matches the regular price
    if (regularPriceId) {
      try {
        const existingPrice = await stripe.prices.retrieve(regularPriceId);
        const existingPriceAmount = existingPrice.unit_amount / 100;
        
        if (Math.abs(existingPriceAmount - regularPrice) >= 0.01) {
          // Stored price doesn't match regular price - create new price
          regularPriceId = null;
        }
      } catch (error) {
        // Price doesn't exist - create new one
        regularPriceId = null;
      }
    }

    // Create new price if needed
    if (!regularPriceId) {
      // Get product ID
      let productId = pkg.stripe_product_id;
      if (!productId) {
        // Create product if needed
        const product = await stripe.products.create({
          name: pkg.name,
          description: pkg.description || `Monthly subscription for ${pkg.name}`,
          metadata: {
            package_id: packageId,
          },
        });
        productId = product.id;
        
        await PricingPackage.update(packageId, {
          stripe_product_id: productId,
        });
      }

      // Create new price for regular (non-sale) amount
      const newPrice = await stripe.prices.create({
        currency: 'cad',
        product: productId,
        unit_amount: Math.round(regularPrice * 100),
        recurring: {
          interval: 'month',
        },
      });
      
      regularPriceId = newPrice.id;
      
      // Save the regular price ID to package
      await PricingPackage.update(packageId, {
        stripe_price_id: regularPriceId,
      });
    }

    // Get subscription to find subscription item
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const subscriptionItems = subscription.items.data;
    
    if (subscriptionItems.length === 0) {
      throw new Error(`No subscription items found for subscription ${subscriptionId}`);
    }

    const subscriptionItemId = subscriptionItems[0].id;
    
    // Update subscription item to use regular price
    // This will take effect on the next billing cycle
    await stripe.subscriptionItems.update(subscriptionItemId, {
      price: regularPriceId,
      proration_behavior: 'none', // Don't prorate - apply to next billing cycle
    });

    console.log(`[StripeService] Updated subscription ${subscriptionId} to regular price: ${regularPrice} CAD/month`);
  }
}

