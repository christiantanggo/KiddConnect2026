// routes/clickbank.js
// ClickBank INS (Instant Notification Service) webhook handler

import express from 'express';
import { processClickBankOrder, decryptClickBankNotification } from '../services/clickbank.js';

const router = express.Router();

/**
 * ClickBank INS Webhook Endpoint
 * 
 * ClickBank v6.0 sends encrypted JSON notifications.
 * Older versions may send form-encoded data (not currently supported).
 * 
 * URL to configure in ClickBank: https://api.tavarios.com/api/clickbank/webhook
 */
router.post('/webhook', async (req, res) => {
  console.log('[ClickBank Webhook] ========== WEBHOOK REQUEST RECEIVED ==========');
  console.log('[ClickBank Webhook] Method:', req.method);
  console.log('[ClickBank Webhook] Content-Type:', req.headers['content-type']);
  console.log('[ClickBank Webhook] Body keys:', Object.keys(req.body || {}));
  
  try {
    const secretKey = process.env.CLICKBANK_CLIENT_SECRET;
    
    // Check if this is an encrypted v6.0 notification (JSON with notification and iv fields)
    if (req.body && req.body.notification && req.body.iv) {
      console.log('[ClickBank Webhook] Detected encrypted v6.0 notification format');
      
      if (!secretKey) {
        console.error('[ClickBank Webhook] ❌ CLICKBANK_CLIENT_SECRET not configured, cannot decrypt notification');
        return res.status(500).send('Secret key not configured');
      }
      
      // Decrypt the notification
      const params = decryptClickBankNotification(req.body.notification, req.body.iv, secretKey);
      
      if (!params) {
        console.error('[ClickBank Webhook] ❌ Failed to decrypt notification');
        console.error('[ClickBank Webhook] Secret key length:', secretKey ? secretKey.length : 0);
        console.error('[ClickBank Webhook] Notification length:', req.body.notification ? req.body.notification.length : 0);
        console.error('[ClickBank Webhook] IV length:', req.body.iv ? req.body.iv.length : 0);
        console.error('[ClickBank Webhook] ⚠️  ACTION REQUIRED: Contact ClickBank support for exact encryption specification');
        console.error('[ClickBank Webhook] ⚠️  Or check ClickBank dashboard for option to disable encryption/use older INS version');
        // Return 200 to prevent ClickBank from retrying, but log the error
        return res.status(200).send('OK - Decryption failed, logged for manual review');
      }
      
      console.log('[ClickBank Webhook] Decrypted params keys:', Object.keys(params));
      
      // Log transaction details
      const receipt = params.receipt || params.receiptNumber || 'unknown';
      const transactionType = params.transactionType || params.transactionType || 'unknown';
      const customerEmail = params.customerEmail || params.email || 'unknown';
      
      console.log(`[ClickBank Webhook] Processing transaction: ${transactionType} | Receipt: ${receipt} | Email: ${customerEmail}`);
      
      // Process the order
      const result = await processClickBankOrder(params);
      
      if (result.skipped) {
        console.log(`[ClickBank Webhook] ⚠️  Order skipped: ${result.reason}`);
        return res.status(200).send(`OK - ${result.reason}`);
      }
      
      if (result.success) {
        console.log(`[ClickBank Webhook] ✅ Account created successfully for ${result.email}`);
        return res.status(200).send('OK');
      } else {
        console.error('[ClickBank Webhook] ❌ Failed to process order:', result);
        return res.status(500).send('Failed to process order');
      }
    } else {
      // Legacy format (form-encoded) - not currently supported for v6.0
      console.error('[ClickBank Webhook] ❌ Unsupported notification format. Expected encrypted v6.0 format with notification and iv fields.');
      console.error('[ClickBank Webhook] Body:', JSON.stringify(req.body, null, 2));
      return res.status(400).send('Unsupported notification format');
    }
  } catch (error) {
    console.error('[ClickBank Webhook] ❌ Error processing webhook:', error);
    console.error('[ClickBank Webhook] Error details:', {
      message: error.message,
      stack: error.stack,
    });
    
    // Always return 200 to ClickBank to prevent retries for errors we can't recover from
    // But log the error for manual review
    return res.status(200).send('OK - Error logged');
  }
});

/**
 * Health check endpoint for ClickBank webhook
 * GET /api/clickbank/webhook - Verify endpoint is accessible
 */
router.get('/webhook', (_req, res) => {
  const backendUrl = process.env.BACKEND_URL || 
                    process.env.RAILWAY_PUBLIC_DOMAIN || 
                    process.env.VERCEL_URL || 
                    process.env.SERVER_URL ||
                    'https://api.tavarios.com';
  
  const webhookUrl = `${backendUrl}/api/clickbank/webhook`;
  
  res.status(200).json({
    status: '✅ ClickBank webhook endpoint is accessible',
    webhookUrl: webhookUrl,
    configured: !!(process.env.BACKEND_URL || process.env.RAILWAY_PUBLIC_DOMAIN),
    message: 'Configure this URL in ClickBank: My Site → Instant Notification Service (INS)',
    note: 'CLICKBANK_CLIENT_SECRET should be configured for signature verification',
  });
});

export default router;

