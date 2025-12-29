// routes/clickbank.js
// ClickBank INS (Instant Notification Service) webhook handler

import express from 'express';
import { processClickBankOrder, verifyClickBankSignature } from '../services/clickbank.js';

const router = express.Router();

/**
 * ClickBank INS Webhook Endpoint
 * 
 * ClickBank sends order notifications via POST with form-encoded data.
 * This endpoint receives these notifications and automatically creates accounts.
 * 
 * URL to configure in ClickBank: https://api.tavarios.com/api/clickbank/webhook
 */
router.post('/webhook', express.urlencoded({ extended: true }), async (req, res) => {
  console.log('[ClickBank Webhook] ========== WEBHOOK REQUEST RECEIVED ==========');
  console.log('[ClickBank Webhook] Method:', req.method);
  console.log('[ClickBank Webhook] Headers:', JSON.stringify(req.headers, null, 2));
  console.log('[ClickBank Webhook] Body:', JSON.stringify(req.body, null, 2));
  
  try {
    // ClickBank sends data as form-encoded parameters
    const params = req.body;
    
    // Verify signature if CLICKBANK_CLIENT_SECRET is configured
    const secretKey = process.env.CLICKBANK_CLIENT_SECRET;
    if (secretKey && !verifyClickBankSignature(params, secretKey)) {
      console.error('[ClickBank Webhook] ❌ Invalid signature');
      return res.status(401).send('Invalid signature');
    }
    
    // Log transaction details
    const receipt = params.receipt || 'unknown';
    const transactionType = params.transactionType || 'unknown';
    const customerEmail = params.customerEmail || 'unknown';
    
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

