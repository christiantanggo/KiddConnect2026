// routes/clickbank.js
// ClickBank INS (Instant Notification Service) webhook handler

import express from 'express';
import { processClickBankOrder, verifyClickBankSignature } from '../services/clickbank.js';

const router = express.Router();

/**
 * ClickBank INS Webhook Endpoint
 * 
 * ClickBank uses HMAC-SHA256 signature verification (not encryption).
 * Payload is plain JSON with transaction data.
 * 
 * URL to configure in ClickBank: https://api.tavarios.com/api/clickbank/webhook
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  console.log('[ClickBank Webhook] ========== WEBHOOK REQUEST RECEIVED ==========');
  console.log('[ClickBank Webhook] Method:', req.method);
  console.log('[ClickBank Webhook] Content-Type:', req.headers['content-type']);
  console.log('[ClickBank Webhook] Headers:', Object.keys(req.headers));
  console.log('[ClickBank Webhook] Body type:', typeof req.body);
  console.log('[ClickBank Webhook] Body is Buffer:', Buffer.isBuffer(req.body));
  console.log('[ClickBank Webhook] Body length:', req.body?.length || 0);
  
  try {
    const secretKey = process.env.CLICKBANK_CLIENT_SECRET;
    
    // Get raw body as string for HMAC verification
    let rawBodyString = '';
    if (Buffer.isBuffer(req.body)) {
      rawBodyString = req.body.toString('utf8');
    } else if (typeof req.body === 'string') {
      rawBodyString = req.body;
    } else {
      rawBodyString = JSON.stringify(req.body);
    }
    
    console.log('[ClickBank Webhook] Raw body (first 500 chars):', rawBodyString.substring(0, 500));
    
    // Check for HMAC signature in headers (ClickBank might use different header names)
    const signatureHeader = req.headers['x-clickbank-signature'] || 
                           req.headers['clickbank-signature'] || 
                           req.headers['signature'] ||
                           null;
    
    console.log('[ClickBank Webhook] Signature header:', signatureHeader ? 'Found' : 'Not found');
    
    // Verify HMAC signature if provided
    if (signatureHeader && secretKey) {
      const isValid = verifyClickBankSignature(rawBodyString, signatureHeader, secretKey);
      if (!isValid) {
        console.error('[ClickBank Webhook] ❌ HMAC signature verification failed');
        return res.status(401).send('Invalid signature');
      }
    } else if (!secretKey) {
      console.warn('[ClickBank Webhook] ⚠️  CLICKBANK_CLIENT_SECRET not configured, skipping signature verification');
    } else {
      console.warn('[ClickBank Webhook] ⚠️  No signature header found, proceeding without verification');
    }
    
    // Parse the payload - ClickBank sends plain JSON
    let params = {};
    try {
      params = JSON.parse(rawBodyString);
      console.log('[ClickBank Webhook] ✅ Parsed JSON body successfully');
      console.log('[ClickBank Webhook] Body keys:', Object.keys(params));
    } catch (parseError) {
      console.error('[ClickBank Webhook] ❌ Failed to parse JSON body:', parseError.message);
      console.error('[ClickBank Webhook] Raw body:', rawBodyString);
      return res.status(400).send('Invalid JSON payload');
    }
    
    // Handle case where ClickBank might wrap data in a notification field
    // ClickBank v6.0 sends encrypted notifications, but we need unencrypted JSON
    if (params && params.notification && typeof params.notification === 'string' && params.iv) {
      console.error('[ClickBank Webhook] ❌ ClickBank is sending ENCRYPTED v6.0 notifications');
      console.error('[ClickBank Webhook] ⚠️  ACTION REQUIRED: Configure ClickBank to send UNENCRYPTED notifications');
      console.error('[ClickBank Webhook]');
      console.error('[ClickBank Webhook] To fix this:');
      console.error('[ClickBank Webhook] 1. Log into ClickBank Vendor Account');
      console.error('[ClickBank Webhook] 2. Go to: My Site → Instant Notification Service (INS)');
      console.error('[ClickBank Webhook] 3. Check INS version settings - upgrade to v7.0 if available (sends unencrypted JSON)');
      console.error('[ClickBank Webhook] 4. OR disable encryption/use older INS version that sends plain JSON');
      console.error('[ClickBank Webhook] 5. OR contact ClickBank support to configure unencrypted notifications');
      console.error('[ClickBank Webhook]');
      console.error('[ClickBank Webhook] Current format: Encrypted v6.0 (notification + iv fields)');
      console.error('[ClickBank Webhook] Required format: Plain JSON with transaction fields (receipt, transactionType, email, etc.)');
      console.error('[ClickBank Webhook]');
      console.error('[ClickBank Webhook] Returning 200 OK to prevent ClickBank retries, but order NOT processed');
      return res.status(200).send('OK - Encrypted notifications not supported. Please configure ClickBank to send unencrypted JSON.');
    }
    
    // If notification field exists but no IV, try parsing it as base64-encoded JSON
    if (params && params.notification && typeof params.notification === 'string' && !params.iv) {
      try {
        // Try decoding as base64 first
        const decoded = Buffer.from(params.notification, 'base64').toString('utf8');
        const parsed = JSON.parse(decoded);
        params = parsed;
        console.log('[ClickBank Webhook] ✅ Parsed base64-encoded notification field as JSON');
      } catch (base64Error) {
        // If base64 decode fails, try parsing as direct JSON
        try {
          const parsed = JSON.parse(params.notification);
          params = parsed;
          console.log('[ClickBank Webhook] ✅ Parsed notification field as direct JSON');
        } catch (jsonError) {
          console.log('[ClickBank Webhook] ⚠️  Notification field could not be parsed as JSON');
          // Continue with original body - maybe the data is elsewhere
        }
      }
    }
    
    console.log('[ClickBank Webhook] Final params keys:', Object.keys(params || {}));
    console.log('[ClickBank Webhook] Full params:', JSON.stringify(params, null, 2));
    
    // Extract transaction data
    const receipt = params?.receipt || params?.receiptNumber || 'unknown';
    const transactionType = params?.transactionType || params?.txn_type || 'unknown';
    const customerEmail = params?.customerEmail || params?.email || 'unknown';
    const itemNumber = params?.itemNo || params?.itemNumber || params?.item || params?.cbitems || null;
    
    console.log(`[ClickBank Webhook] Processing transaction: ${transactionType} | Receipt: ${receipt} | Email: ${customerEmail} | Item: ${itemNumber}`);
    
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

