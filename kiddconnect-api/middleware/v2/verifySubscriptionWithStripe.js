import { Subscription } from '../../models/v2/Subscription.js';
import { AuditLog } from '../../models/v2/AuditLog.js';
import { getStripeInstance } from '../../services/stripe.js';

/**
 * verifySubscriptionWithStripe Middleware
 * Verifies active Stripe subscription for module (Stripe is source of truth)
 * Reads module_key from req.params.moduleKey, req.body.module_key, req.query.module_key, or req.module_key
 */
export const verifySubscriptionWithStripe = async (req, res, next) => {
  try {
    // Check multiple sources for module_key (in priority order)
    const moduleKey = req.params.moduleKey || req.body.module_key || req.query.module_key || req.module_key;
    const businessId = req.active_business_id;
    
    if (!moduleKey) {
      return res.status(400).json({
        error: 'Module key required',
        code: 'MODULE_KEY_REQUIRED'
      });
    }
    
    // Get subscription from database
    let subscription = await Subscription.findByBusinessAndModule(businessId, moduleKey);
    
    // If no subscription, deny access
    if (!subscription) {
      return res.status(403).json({
        error: 'Subscription required',
        code: 'SUBSCRIPTION_REQUIRED',
        module_key: moduleKey,
        message: `A subscription is required to use this module. Please subscribe to continue.`
      });
    }
    
    // Verify with Stripe (source of truth)
    if (subscription.stripe_subscription_item_id) {
      try {
        const stripe = getStripeInstance();
        const subscriptionItem = await stripe.subscriptionItems.retrieve(subscription.stripe_subscription_item_id);
        
        // Get the parent subscription
        const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionItem.subscription);
        
        // Check if subscription is active
        if (!['active', 'trialing', 'past_due'].includes(stripeSubscription.status)) {
          // Subscription is canceled/expired in Stripe but cached as active
          // Update cache and deny access
          await Subscription.updateStatus(businessId, moduleKey, 'canceled');
          
          // Log discrepancy
          await AuditLog.create({
            business_id: businessId,
            user_id: req.user?.id,
            action: 'subscription_mismatch_detected',
            resource_type: 'subscription',
            resource_id: subscription.id,
            metadata: {
              module_key: moduleKey,
              cached_status: subscription.status,
              stripe_status: stripeSubscription.status,
              discrepancy_resolved: true
            },
            ip_address: req.ip,
            user_agent: req.headers['user-agent']
          }).catch(err => console.error('[verifySubscriptionWithStripe] Failed to log audit:', err));
          
          return res.status(403).json({
            error: 'Subscription inactive',
            code: 'SUBSCRIPTION_INACTIVE',
            module_key: moduleKey,
            stripe_status: stripeSubscription.status,
            message: 'Your subscription is no longer active. Please update your payment method or renew your subscription.'
          });
        }
        
        // Update cached status if different (but still active)
        if (subscription.status !== stripeSubscription.status && ['active', 'trialing', 'past_due'].includes(stripeSubscription.status)) {
          await Subscription.updateStatus(businessId, moduleKey, stripeSubscription.status);
          subscription.status = stripeSubscription.status;
        }
      } catch (stripeError) {
        console.error('[verifySubscriptionWithStripe] Stripe API error:', stripeError);
        // If Stripe API fails, allow cached subscription but log warning
        console.warn('[verifySubscriptionWithStripe] Using cached subscription status due to Stripe API error');
      }
    }
    
    // Check cached status as fallback
    if (!['active', 'trialing', 'past_due'].includes(subscription.status)) {
      return res.status(403).json({
        error: 'Subscription inactive',
        code: 'SUBSCRIPTION_INACTIVE',
        module_key: moduleKey,
        status: subscription.status,
        message: 'Your subscription is no longer active. Please update your payment method or renew your subscription.'
      });
    }
    
    // Attach subscription to request for handler use
    req.subscription = subscription;
    next();
  } catch (error) {
    console.error('[verifySubscriptionWithStripe] Error:', error);
    return res.status(500).json({
      error: 'Failed to verify subscription',
      code: 'SUBSCRIPTION_CHECK_ERROR'
    });
  }
};





