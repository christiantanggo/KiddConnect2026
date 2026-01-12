import express from 'express';
import { getStripeInstance } from '../../../services/stripe.js';
import { Subscription } from '../../../models/v2/Subscription.js';
import { AuditLog } from '../../../models/v2/AuditLog.js';
import { Business } from '../../../models/Business.js';
import { Notification } from '../../../models/v2/Notification.js';

const router = express.Router();

/**
 * POST /api/v2/webhooks/stripe
 * Stripe webhook handler for v2 module subscriptions
 * Handles subscription item updates for modules
 * 
 * CRITICAL: All webhooks MUST verify signature before processing
 */
router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.warn('[v2 Stripe Webhook] ⚠️ STRIPE_WEBHOOK_SECRET not configured');
    return res.status(400).send('Webhook secret not configured');
  }

  if (!sig) {
    console.error('[v2 Stripe Webhook] ❌ Missing stripe-signature header');
    
    // Log security event
    await AuditLog.create({
      action: 'webhook_signature_invalid',
      metadata: { provider: 'stripe', reason: 'missing_signature' }
    }).catch(err => console.error('Failed to log audit:', err));
    
    return res.status(401).send('Webhook signature verification failed');
  }

  let event;

  try {
    const stripe = getStripeInstance();
    
    // Verify signature
    if (!Buffer.isBuffer(req.body)) {
      console.error('[v2 Stripe Webhook] ❌ Request body is not a Buffer');
      await AuditLog.create({
        action: 'webhook_signature_invalid',
        metadata: { provider: 'stripe', reason: 'invalid_body_format' }
      }).catch(err => console.error('Failed to log audit:', err));
      
      return res.status(400).send('Invalid request body format');
    }
    
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    console.log('[v2 Stripe Webhook] ✅ Signature verified successfully');
  } catch (err) {
    console.error('[v2 Stripe Webhook] ❌ Signature verification failed:', err.message);
    
    // Log security event
    await AuditLog.create({
      action: 'webhook_signature_invalid',
      metadata: {
        provider: 'stripe',
        error: err.message,
        event_id: req.headers['stripe-signature']?.substring(0, 20)
      }
    }).catch(logErr => console.error('Failed to log audit:', logErr));
    
    return res.status(401).send(`Webhook signature verification failed: ${err.message}`);
  }

  try {
    console.log('[v2 Stripe Webhook] Processing event:', event.type);
    
    // Handle subscription-related events
    switch (event.type) {
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;
        
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
        
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;
        
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
        
      default:
        console.log('[v2 Stripe Webhook] Unhandled event type:', event.type);
    }
    
    res.json({ received: true });
  } catch (error) {
    console.error('[v2 Stripe Webhook] Error processing webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * Handle subscription.updated event
 * Updates subscriptions.status to match Stripe subscription status
 */
async function handleSubscriptionUpdated(stripeSubscription) {
  try {
    const stripe = getStripeInstance();
    
    // Get subscription items
    const items = stripeSubscription.items.data || [];
    
    for (const item of items) {
      // Find subscription by stripe_subscription_item_id
      const { supabaseClient } = await import('../../../config/database.js');
      const { data: subscriptions } = await supabaseClient
        .from('subscriptions')
        .select('*')
        .eq('stripe_subscription_item_id', item.id)
        .limit(1);
      
      if (subscriptions && subscriptions.length > 0) {
        const subscription = subscriptions[0];
        
        // Update status to match Stripe (Stripe is source of truth)
        const newStatus = stripeSubscription.status === 'active' ? 'active' :
                         stripeSubscription.status === 'canceled' ? 'canceled' :
                         stripeSubscription.status === 'past_due' ? 'expired' :
                         'pending';
        
        // Only update if different (avoid unnecessary writes)
        if (subscription.status !== newStatus) {
          await Subscription.update(subscription.id, {
            status: newStatus,
            ends_at: stripeSubscription.cancel_at ? new Date(stripeSubscription.cancel_at * 1000).toISOString() : null
          });
          
          // Log discrepancy if status changed
          await AuditLog.create({
            action: 'subscription_status_sync',
            business_id: subscription.business_id,
            metadata: {
              module_key: subscription.module_key,
              cached_status: subscription.status,
              stripe_status: newStatus,
              subscription_id: stripeSubscription.id,
              subscription_item_id: item.id
            }
          }).catch(err => console.error('Failed to log audit:', err));
          
          console.log(`[v2 Stripe Webhook] Updated subscription status: ${subscription.business_id}/${subscription.module_key} -> ${newStatus}`);
        }
      }
    }
  } catch (error) {
    console.error('[v2 Stripe Webhook] Error in handleSubscriptionUpdated:', error);
    throw error;
  }
}

/**
 * Handle subscription.deleted event
 * Updates subscriptions.status to 'canceled'
 */
async function handleSubscriptionDeleted(stripeSubscription) {
  try {
    const stripe = getStripeInstance();
    const items = stripeSubscription.items.data || [];
    
    for (const item of items) {
      const { supabaseClient } = await import('../../../config/database.js');
      const { data: subscriptions } = await supabaseClient
        .from('subscriptions')
        .select('*')
        .eq('stripe_subscription_item_id', item.id)
        .limit(1);
      
      if (subscriptions && subscriptions.length > 0) {
        const subscription = subscriptions[0];
        
        await Subscription.update(subscription.id, {
          status: 'canceled',
          ends_at: new Date().toISOString()
        });
        
        await AuditLog.create({
          action: 'subscription_status_change',
          business_id: subscription.business_id,
          metadata: {
            module_key: subscription.module_key,
            old_status: subscription.status,
            new_status: 'canceled',
            reason: 'stripe_subscription_deleted'
          }
        }).catch(err => console.error('Failed to log audit:', err));
      }
    }
  } catch (error) {
    console.error('[v2 Stripe Webhook] Error in handleSubscriptionDeleted:', error);
    throw error;
  }
}

/**
 * Handle invoice.payment_succeeded event
 * Ensures subscription status is 'active'
 */
async function handlePaymentSucceeded(stripeInvoice) {
  try {
    if (!stripeInvoice.subscription) return;
    
    const stripe = getStripeInstance();
    const subscription = await stripe.subscriptions.retrieve(stripeInvoice.subscription);
    
    await handleSubscriptionUpdated(subscription);

    // Create notification for successful payment
    try {
      const { supabaseClient } = await import('../../../config/database.js');
      const { data: subscriptions } = await supabaseClient
        .from('subscriptions')
        .select('business_id, module_key')
        .eq('stripe_subscription_item_id', subscription.items.data[0]?.id)
        .limit(1);

      if (subscriptions && subscriptions.length > 0) {
        const sub = subscriptions[0];
        const amount = (stripeInvoice.amount_paid / 100).toFixed(2);
        const currency = stripeInvoice.currency.toUpperCase();
        
        await Notification.create({
          business_id: sub.business_id,
          user_id: null, // All users in organization see this
          type: 'billing',
          message: `Payment successful: ${currency} ${amount} charged for ${sub.module_key}`,
          metadata: {
            module_key: sub.module_key,
            invoice_id: stripeInvoice.id,
            amount_paid: stripeInvoice.amount_paid,
            currency: stripeInvoice.currency,
            subscription_id: stripeInvoice.subscription,
          },
        });
        console.log('[v2 Stripe Webhook] ✅ In-app notification created for payment success');
      }
    } catch (notifError) {
      console.error('[v2 Stripe Webhook] ⚠️ Failed to create payment success notification (non-blocking):', notifError);
    }
  } catch (error) {
    console.error('[v2 Stripe Webhook] Error in handlePaymentSucceeded:', error);
    throw error;
  }
}

/**
 * Handle invoice.payment_failed event
 * May need to update status depending on business logic
 */
async function handlePaymentFailed(stripeInvoice) {
  try {
    if (!stripeInvoice.subscription) return;
    
    // Payment failed doesn't necessarily mean subscription is canceled
    // Stripe will retry and eventually cancel if payment continues to fail
    // We just log it for now - actual cancellation will come via subscription.deleted
    console.log('[v2 Stripe Webhook] Payment failed for subscription:', stripeInvoice.subscription);
    
    // Create notification for failed payment
    try {
      const { supabaseClient } = await import('../../../config/database.js');
      const stripe = getStripeInstance();
      const subscription = await stripe.subscriptions.retrieve(stripeInvoice.subscription);
      
      const { data: subscriptions } = await supabaseClient
        .from('subscriptions')
        .select('business_id, module_key')
        .eq('stripe_subscription_item_id', subscription.items.data[0]?.id)
        .limit(1);

      if (subscriptions && subscriptions.length > 0) {
        const sub = subscriptions[0];
        const amount = (stripeInvoice.amount_due / 100).toFixed(2);
        const currency = stripeInvoice.currency.toUpperCase();
        const attemptCount = stripeInvoice.attempt_count || 1;
        
        await Notification.create({
          business_id: sub.business_id,
          user_id: null, // All users in organization see this
          type: 'warning',
          message: `Payment failed: ${currency} ${amount} could not be charged for ${sub.module_key} (attempt ${attemptCount}). Please update your payment method.`,
          metadata: {
            module_key: sub.module_key,
            invoice_id: stripeInvoice.id,
            amount_due: stripeInvoice.amount_due,
            currency: stripeInvoice.currency,
            attempt_count: attemptCount,
            subscription_id: stripeInvoice.subscription,
          },
        });
        console.log('[v2 Stripe Webhook] ✅ In-app notification created for payment failure');
      }
    } catch (notifError) {
      console.error('[v2 Stripe Webhook] ⚠️ Failed to create payment failure notification (non-blocking):', notifError);
    }
    
    // Could update to 'past_due' status if needed, but for now we rely on Stripe subscription status
  } catch (error) {
    console.error('[v2 Stripe Webhook] Error in handlePaymentFailed:', error);
    throw error;
  }
}

export default router;
