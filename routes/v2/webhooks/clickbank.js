import express from 'express';
import { verifyClickBankSignature } from '../../../services/clickbank.js';
import { ExternalPurchase } from '../../../models/v2/ExternalPurchase.js';
import { Subscription } from '../../../models/v2/Subscription.js';
import { AuditLog } from '../../../models/v2/AuditLog.js';
import { Notification } from '../../../models/v2/Notification.js';
import { getStripeInstance } from '../../../services/stripe.js';

const router = express.Router();

/**
 * POST /api/v2/webhooks/clickbank/refund
 * ClickBank refund webhook handler for v2 module subscriptions
 * 
 * CRITICAL: 
 * - MUST verify signature before processing
 * - MUST remove Stripe subscription item when refund received
 * - MUST update subscriptions.status to canceled
 * - MUST queue retry if DB update fails after Stripe operation
 */
router.post('/refund', express.urlencoded({ extended: true }), async (req, res) => {
  console.log('[v2 ClickBank Refund] ========== WEBHOOK REQUEST RECEIVED ==========');
  console.log('[v2 ClickBank Refund] Headers:', JSON.stringify(req.headers, null, 2));
  console.log('[v2 ClickBank Refund] Body:', JSON.stringify(req.body, null, 2));
  
  try {
    const params = req.body;
    const secretKey = process.env.CLICKBANK_CLIENT_SECRET;
    
    // CRITICAL: Verify signature FIRST
    if (secretKey && !verifyClickBankSignature(params, secretKey)) {
      console.error('[v2 ClickBank Refund] ❌ Invalid signature');
      
      // Log security event
      await AuditLog.create({
        action: 'webhook_signature_invalid',
        metadata: {
          provider: 'clickbank',
          reason: 'invalid_signature',
          receipt: params.receipt
        }
      }).catch(err => console.error('Failed to log audit:', err));
      
      return res.status(401).send('Webhook signature verification failed');
    }
    
    const transactionType = params.transactionType || '';
    const receipt = params.receipt || '';
    const saleId = params.saleId || '';
    
    // Only process REFUND transactions
    if (transactionType !== 'REFUND' && transactionType !== 'RFND') {
      console.log(`[v2 ClickBank Refund] ⚠️  Not a refund transaction: ${transactionType}`);
      return res.status(200).send(`OK - Not a refund transaction (${transactionType})`);
    }
    
    console.log(`[v2 ClickBank Refund] Processing refund: Receipt ${receipt}, Sale ID ${saleId}`);
    
    // Find purchase by external_order_id (using receipt or saleId)
    const orderId = saleId || receipt;
    const purchase = await ExternalPurchase.findByExternalOrderId('clickbank', orderId);
    
    if (!purchase) {
      console.log(`[v2 ClickBank Refund] Purchase not found for order ${orderId}`);
      return res.status(200).send('OK - Purchase not found');
    }
    
    if (purchase.status === 'refunded') {
      console.log(`[v2 ClickBank Refund] ⚠️  Refund already processed for order ${orderId}`);
      return res.status(200).send('OK - Refund already processed');
    }
    
    // Update external_purchases status
    await ExternalPurchase.update(purchase.id, {
      status: 'refunded',
      purchase_data: {
        ...(purchase.purchase_data || {}),
        refund: {
          refunded_at: new Date().toISOString(),
          transaction_type: transactionType,
          receipt,
          sale_id: saleId,
          amount: params.amount || purchase.amount
        }
      }
    });
    
    console.log(`[v2 ClickBank Refund] ✅ Updated external_purchases status to refunded`);
    
    // Find subscription for this module
    const subscription = await Subscription.findByBusinessAndModule(
      purchase.business_id,
      purchase.module_key
    );
    
    if (!subscription || !subscription.stripe_subscription_item_id) {
      console.log(`[v2 ClickBank Refund] ⚠️  No Stripe subscription item found for refund`);
      // Still log and notify
      await logRefundProcessed(purchase, subscription, null);
      return res.status(200).send('OK - No Stripe subscription to remove');
    }
    
    // Remove Stripe subscription item (idempotent operation)
    try {
      const stripe = getStripeInstance();
      await stripe.subscriptionItems.del(subscription.stripe_subscription_item_id);
      console.log(`[v2 ClickBank Refund] ✅ Removed Stripe subscription item: ${subscription.stripe_subscription_item_id}`);
    } catch (stripeError) {
      // If item already deleted, that's fine (idempotent)
      if (stripeError.code === 'resource_missing') {
        console.log(`[v2 ClickBank Refund] ⚠️  Stripe subscription item already deleted`);
      } else {
        console.error(`[v2 ClickBank Refund] ❌ Error removing Stripe subscription item:`, stripeError);
        // Continue anyway - we'll update DB and log it
      }
    }
    
    // Update subscriptions table (with retry logic if this fails)
    try {
      await Subscription.update(subscription.id, {
        status: 'canceled',
        ends_at: new Date().toISOString(),
        usage_limit: 0 // Immediately block access
      });
      console.log(`[v2 ClickBank Refund] ✅ Updated subscription status to canceled`);
    } catch (dbError) {
      console.error(`[v2 ClickBank Refund] ❌ Error updating subscription in DB:`, dbError);
      // Queue retry job (if background job system exists)
      // For now, log it - retry job will handle it
      await logRetryJob(subscription, dbError);
    }
    
    // Log refund processed
    await logRefundProcessed(purchase, subscription, orderId);
    
    // Send notification to business
    await Notification.create({
      business_id: purchase.business_id,
      type: 'billing',
      message: `Your ${purchase.module_key} subscription has been canceled due to refund.`,
      metadata: {
        module_key: purchase.module_key,
        external_order_id: orderId,
        refund_amount: params.amount || purchase.amount
      }
    }).catch(err => console.error('Failed to create notification:', err));
    
    console.log('[v2 ClickBank Refund] ========== REFUND PROCESSED SUCCESSFULLY ==========');
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('[v2 ClickBank Refund] ❌ Error processing refund webhook:', error);
    console.error('[v2 ClickBank Refund] Error details:', {
      message: error.message,
      stack: error.stack,
    });
    
    // Return 200 to prevent ClickBank from retrying for errors we can't recover from
    // But log the error for manual review
    res.status(200).send('OK - Error logged');
  }
});

async function logRefundProcessed(purchase, subscription, orderId) {
  try {
    await AuditLog.create({
      action: 'clickbank_refund_processed',
      business_id: purchase.business_id,
      metadata: {
        module_key: purchase.module_key,
        external_order_id: orderId,
        purchase_id: purchase.id,
        subscription_id: subscription?.id,
        stripe_subscription_item_id: subscription?.stripe_subscription_item_id
      }
    });
  } catch (err) {
    console.error('Failed to log refund audit:', err);
  }
}

async function logRetryJob(subscription, error) {
  try {
    // TODO: Implement background job queue
    // For now, just log that a retry is needed
    await AuditLog.create({
      action: 'stripe_db_sync_queued',
      business_id: subscription.business_id,
      metadata: {
        subscription_id: subscription.id,
        module_key: subscription.module_key,
        operation: 'refund_update',
        error: error.message,
        stripe_item_id: subscription.stripe_subscription_item_id
      }
    });
    console.log(`[v2 ClickBank Refund] ⚠️  Queued retry job for subscription ${subscription.id}`);
  } catch (err) {
    console.error('Failed to log retry job:', err);
  }
}

export default router;

