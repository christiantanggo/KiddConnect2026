import express from 'express';
import { StripeService } from '../services/stripe.js';
import { authenticate } from '../middleware/auth.js';
import { Business } from '../models/Business.js';
import { PricingPackage } from '../models/PricingPackage.js';

const router = express.Router();

// Check if Stripe is in test mode (public endpoint for setup wizard)
router.get('/test-mode', async (req, res) => {
  try {
    const { isStripeTestMode } = await import('../services/stripe.js');
    const testMode = isStripeTestMode();
    res.json({ testMode });
  } catch (error) {
    console.error('Get Stripe test mode error:', error);
    res.status(500).json({ error: 'Failed to check Stripe mode' });
  }
});

// Get available packages (public endpoint - no auth required for pricing modal)
router.get('/packages', async (req, res) => {
  try {
    // Show all active packages (both public and private) for billing
    // This ensures all live/active plans are available for purchase
    const packages = await PricingPackage.findAll({
      includeInactive: false, // Only show active packages
      includePrivate: true, // Include all packages (public and private) - show all live plans
    });
    
    console.log('[Billing] Found packages:', packages.length);
    console.log('[Billing] Packages:', packages.map(p => ({ 
      id: p.id, 
      name: p.name, 
      price: p.monthly_price, 
      is_active: p.is_active,
      is_public: p.is_public,
      isOnSale: p.isOnSale 
    })));
    
    res.json({ packages });
  } catch (error) {
    console.error('Get packages error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({ 
      error: 'Failed to get packages',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Create checkout/payment session
router.post('/checkout', authenticate, async (req, res) => {
  let packageId;
  try {
    packageId = req.body.packageId;
    
    if (!packageId) {
      return res.status(400).json({ error: 'Package ID is required' });
    }
    
    // Validate packageId is a valid UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(packageId)) {
      return res.status(400).json({ 
        error: 'Invalid package ID format',
        details: `Package ID must be a valid UUID, received: ${packageId}`
      });
    }
    
    // Get package details first (needed for both Stripe and non-Stripe flows)
    const pkg = await PricingPackage.findById(packageId);
    if (!pkg) {
      return res.status(404).json({ error: 'Package not found' });
    }
    
    // Check if sale is available (active and not sold out)
    const isOnSale = PricingPackage.isSaleActive(pkg);
    const saleAvailable = PricingPackage.isSaleAvailable(pkg);
    
    if (isOnSale && !saleAvailable) {
      return res.status(400).json({ 
        error: 'This sale has ended - all available plans have been sold out',
        saleName: pkg.sale_name,
      });
    }
    
    // Determine the price to charge (sale_price if on sale, otherwise monthly_price)
    const priceToCharge = (isOnSale && pkg.sale_price) ? pkg.sale_price : pkg.monthly_price;
    
    // Calculate sale price expiration date if applicable
    let salePriceExpiresAt = null;
    if (isOnSale && pkg.sale_duration_months) {
      const expirationDate = new Date();
      expirationDate.setMonth(expirationDate.getMonth() + pkg.sale_duration_months);
      salePriceExpiresAt = expirationDate.toISOString().split('T')[0];
    }
    
    // Check if Stripe is configured
    if (!process.env.STRIPE_SECRET_KEY) {
      console.log('[Billing] ⚠️ STRIPE_SECRET_KEY not configured, updating package locally');
      
      const updateData = {
        package_id: packageId,
        plan_tier: pkg.name.toLowerCase(),
        usage_limit_minutes: pkg.minutes_included,
      };
      
      // Track sale purchase details if on sale
      if (isOnSale) {
        updateData.purchased_at_sale_price = priceToCharge;
        updateData.sale_price_expires_at = salePriceExpiresAt;
        updateData.sale_name = pkg.sale_name;
      }
      
      await Business.update(req.businessId, updateData);
      
      // Increment sale count if package is on sale
      if (isOnSale) {
        await PricingPackage.incrementSaleCount(packageId);
      }
      
      return res.json({ 
        success: true,
        packageId: packageId,
        packageName: pkg.name,
        message: 'Package selected. Payment can be completed later in billing settings.',
        skipPayment: true
      });
    }
    
    const business = await Business.findById(req.businessId);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }
    
    const successUrl = `${req.headers.origin || process.env.FRONTEND_URL}/dashboard/billing/success?package_id=${packageId}&from_setup=true&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${req.headers.origin || process.env.FRONTEND_URL}/dashboard/setup`;
    
    // Create Stripe checkout session with the correct price (sale or regular)
    console.log('[Billing] Creating Stripe checkout session for package:', packageId);
    console.log('[Billing] Package regular price:', pkg.monthly_price, 'Sale price:', pkg.sale_price, 'Charging:', priceToCharge);
    const checkoutSession = await StripeService.createCheckoutSession(
      req.businessId,
      packageId,
      priceToCharge,
      pkg.name,
      successUrl,
      cancelUrl,
      isOnSale ? pkg.sale_name : null, // Pass sale name if on sale
      salePriceExpiresAt // Pass sale expiration date
    );
    
    console.log('[Billing] ✅ Stripe checkout session created:', checkoutSession.sessionId);
    console.log('[Billing] ⚠️  Business record will be updated via webhook after payment confirmation');
    
    // DO NOT update business here - wait for webhook to confirm payment
    // The webhook (handleCheckoutCompleted) will update the business record
    // only after Stripe confirms the payment was successful
    
    return res.json({
      url: checkoutSession.url,
      sessionId: checkoutSession.sessionId,
      packageId: packageId,
      packageName: pkg.name,
      message: 'Redirecting to payment page...'
    });
  } catch (error) {
    console.error('Create checkout error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      packageId: packageId || 'not provided',
      businessId: req.businessId,
    });
    res.status(500).json({ 
      error: 'Failed to create checkout session', 
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get subscription status
router.get('/status', authenticate, async (req, res) => {
  try {
    const business = await Business.findById(req.businessId);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const packageId = business.package_id;
    let packageDetails = null;
    
    if (packageId) {
      packageDetails = await PricingPackage.findById(packageId);
    }

    let subscription = null;
    let paymentMethod = null;

    // Fetch subscription and payment method details from Stripe if available
    if (business.stripe_customer_id && process.env.STRIPE_SECRET_KEY) {
      try {
        const { getStripeInstance } = await import('../services/stripe.js');
        const stripe = getStripeInstance();
        
        // Get subscription details if subscription ID exists
        if (business.stripe_subscription_id) {
          try {
            subscription = await stripe.subscriptions.retrieve(business.stripe_subscription_id, {
              expand: ['default_payment_method']
            });
          } catch (subError) {
            console.warn('[Billing Status] Could not retrieve subscription:', subError.message);
          }
        }
        
        // Get payment method from customer if no subscription payment method
        if (!subscription?.default_payment_method) {
          try {
            const customer = await stripe.customers.retrieve(business.stripe_customer_id, {
              expand: ['invoice_settings.default_payment_method']
            });
            
            if (customer.invoice_settings?.default_payment_method) {
              const pm = typeof customer.invoice_settings.default_payment_method === 'string'
                ? await stripe.paymentMethods.retrieve(customer.invoice_settings.default_payment_method)
                : customer.invoice_settings.default_payment_method;
              paymentMethod = pm;
            }
          } catch (pmError) {
            console.warn('[Billing Status] Could not retrieve payment method:', pmError.message);
          }
        } else if (subscription.default_payment_method) {
          // Extract payment method from subscription
          paymentMethod = typeof subscription.default_payment_method === 'string'
            ? await stripe.paymentMethods.retrieve(subscription.default_payment_method)
            : subscription.default_payment_method;
        }
      } catch (stripeError) {
        console.warn('[Billing Status] Error fetching Stripe data:', stripeError.message);
        // Continue without Stripe data - return what we have
      }
    }

    // Extract actual subscription price from Stripe subscription
    let actualSubscriptionPrice = null;
    if (subscription?.items?.data?.length > 0) {
      // Get the price from the first subscription item (should only be one)
      const subscriptionItem = subscription.items.data[0];
      let priceObject = subscriptionItem.price;
      
      // If price is a string ID, we need to retrieve it separately
      if (typeof priceObject === 'string') {
        try {
          const { getStripeInstance } = await import('../services/stripe.js');
          const stripe = getStripeInstance();
          priceObject = await stripe.prices.retrieve(priceObject);
        } catch (priceError) {
          console.warn('[Billing Status] Could not retrieve price object:', priceError.message);
        }
      }
      
      if (priceObject?.unit_amount) {
        // Convert from cents to dollars
        actualSubscriptionPrice = priceObject.unit_amount / 100;
        console.log('[Billing Status] ✅ Extracted subscription price from Stripe:', actualSubscriptionPrice);
      } else {
        console.warn('[Billing Status] ⚠️ Price object does not have unit_amount:', JSON.stringify(priceObject));
      }
    } else if (subscription) {
      console.warn('[Billing Status] ⚠️ Subscription has no items:', subscription.id);
    }
    
    // Fallback to purchased_at_sale_price if available, otherwise use package monthly_price
    // This handles the case where Stripe data isn't available
    if (!actualSubscriptionPrice && business.purchased_at_sale_price) {
      actualSubscriptionPrice = parseFloat(business.purchased_at_sale_price);
      console.log('[Billing Status] ✅ Using purchased_at_sale_price from business:', actualSubscriptionPrice);
    } else if (!actualSubscriptionPrice && packageDetails?.monthly_price) {
      actualSubscriptionPrice = parseFloat(packageDetails.monthly_price);
      console.log('[Billing Status] ✅ Using package monthly_price:', actualSubscriptionPrice);
    } else if (!actualSubscriptionPrice) {
      console.warn('[Billing Status] ⚠️ No price found - using fallback from getPlanDetails');
    }

    res.json({
      packageId: packageId,
      package: packageDetails,
      plan_tier: business.plan_tier,
      usage_limit_minutes: business.usage_limit_minutes,
      subscription: subscription ? {
        id: subscription.id,
        status: subscription.status,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        cancel_at_period_end: subscription.cancel_at_period_end,
        price: actualSubscriptionPrice, // Actual price being charged
      } : null,
      subscription_price: actualSubscriptionPrice, // Actual price being charged (for backward compatibility)
      payment_method: paymentMethod ? {
        id: paymentMethod.id,
        type: paymentMethod.type,
        card: paymentMethod.card ? {
          brand: paymentMethod.card.brand,
          last4: paymentMethod.card.last4,
          exp_month: paymentMethod.card.exp_month,
          exp_year: paymentMethod.card.exp_year,
        } : null,
      } : null,
    });
  } catch (error) {
    console.error('Get subscription status error:', error);
    res.status(500).json({ 
      error: 'Failed to get subscription status',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get Stripe Customer Portal URL for managing payment methods and subscriptions
router.get('/portal', authenticate, async (req, res) => {
  try {
    const business = await Business.findById(req.businessId);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    if (!business.stripe_customer_id) {
      return res.status(400).json({ 
        error: 'No Stripe customer found. Please complete checkout first.',
        message: 'You need to complete a checkout session before managing payment methods.'
      });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json({ 
        error: 'Stripe is not configured',
        message: 'Payment portal is not available. Please contact support.'
      });
    }

    const { getStripeInstance } = await import('../services/stripe.js');
    const stripe = getStripeInstance();
    
    const returnUrl = `${req.headers.origin || process.env.FRONTEND_URL}/dashboard/billing`;
    
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: business.stripe_customer_id,
      return_url: returnUrl,
    });

    res.json({ url: portalSession.url });
  } catch (error) {
    console.error('Get portal session error:', error);
    res.status(500).json({ 
      error: 'Failed to create portal session',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Verify Stripe checkout session
router.get('/verify-session', authenticate, async (req, res) => {
  try {
    const sessionId = req.query.session_id;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    const { getStripeInstance } = await import('../services/stripe.js');
    const stripeInstance = getStripeInstance();
    
    // Retrieve the checkout session
    const session = await stripeInstance.checkout.sessions.retrieve(sessionId);
    
    // Verify the session belongs to this business
    const businessId = session.metadata?.business_id;
    if (businessId !== req.businessId) {
      return res.status(403).json({ error: 'Session does not belong to this business' });
    }

    // Check if payment was successful
    if (session.payment_status === 'paid' && session.status === 'complete') {
      // The webhook should have already updated the subscription, but verify it's set
      const business = await Business.findById(req.businessId);
      
      return res.json({
        success: true,
        sessionId: session.id,
        paymentStatus: session.payment_status,
        subscriptionId: business.stripe_subscription_id,
        packageId: business.package_id,
      });
    }

    return res.json({
      success: false,
      sessionId: session.id,
      paymentStatus: session.payment_status,
      status: session.status,
    });
  } catch (error) {
    console.error('Verify session error:', error);
    res.status(500).json({ 
      error: 'Failed to verify session',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Webhook handler for Stripe events
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  console.log('[Billing Webhook] ========== WEBHOOK REQUEST RECEIVED ==========');
  console.log('[Billing Webhook] Method:', req.method);
  console.log('[Billing Webhook] Path:', req.path);
  console.log('[Billing Webhook] Headers:', JSON.stringify(req.headers, null, 2));
  console.log('[Billing Webhook] Body type:', typeof req.body);
  console.log('[Billing Webhook] Body is Buffer:', Buffer.isBuffer(req.body));
  console.log('[Billing Webhook] Body length:', req.body?.length || 0);
  
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  console.log('[Billing Webhook] Stripe signature header present:', !!sig);
  console.log('[Billing Webhook] Webhook secret configured:', !!webhookSecret);

  let event;

  try {
    if (!webhookSecret) {
      console.warn('[Billing Webhook] ⚠️ STRIPE_WEBHOOK_SECRET not configured, skipping signature verification');
      // In development, accept events without verification (but still need valid JSON)
      if (Buffer.isBuffer(req.body)) {
        event = JSON.parse(req.body.toString());
      } else {
        event = req.body;
      }
    } else if (!sig) {
      console.error('[Billing Webhook] ❌ Missing stripe-signature header');
      console.error('[Billing Webhook] Available headers:', Object.keys(req.headers));
      return res.status(400).send('Webhook Error: Missing stripe-signature header. This request does not appear to be from Stripe.');
    } else {
      // Ensure body is a Buffer for signature verification
      let rawBody = req.body;
      if (!Buffer.isBuffer(rawBody)) {
        console.error('[Billing Webhook] ❌ Request body is not a Buffer. Cannot verify signature.');
        console.error('[Billing Webhook] Body type:', typeof rawBody);
        return res.status(400).send('Webhook Error: Invalid request body format. Body must be raw for signature verification.');
      }
      
      // Use the same Stripe instance logic as the service
      const { getStripeInstance } = await import('../services/stripe.js');
      const stripeInstance = getStripeInstance();
      event = stripeInstance.webhooks.constructEvent(rawBody, sig, webhookSecret);
      console.log('[Billing Webhook] ✅ Signature verified successfully');
    }
  } catch (err) {
    console.error('[Billing Webhook] ❌ Webhook signature verification failed:', err.message);
    console.error('[Billing Webhook] Error details:', {
      message: err.message,
      type: err.type,
      code: err.code,
      stack: err.stack
    });
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    console.log('[Billing Webhook] ========== WEBHOOK EVENT RECEIVED ==========');
    console.log('[Billing Webhook] Event type:', event.type);
    console.log('[Billing Webhook] Event ID:', event.id);
    console.log('[Billing Webhook] Event data:', JSON.stringify(event.data, null, 2));
    
    await StripeService.handleWebhook(event);
    
    console.log('[Billing Webhook] ✅ Webhook processed successfully');
    console.log('[Billing Webhook] ============================================');
    
    res.json({ received: true });
  } catch (error) {
    console.error('[Billing Webhook] ❌ Error processing webhook:', error);
    console.error('[Billing Webhook] Error stack:', error.stack);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;
