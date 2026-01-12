// routes/clickbank.js
// ClickBank INS (Instant Notification Service) webhook handler
// ClickBank INS v8.0 sends plain JSON (no encryption)

import express from 'express';
import { processClickBankOrder } from '../services/clickbank.js';

const router = express.Router();

/**
 * ClickBank INS v8.0 Webhook Endpoint
 * 
 * ClickBank v8.0 sends plain JSON (no encryption, no decryption needed).
 * 
 * URL to configure in ClickBank: https://api.tavarios.com/api/clickbank/webhook
 * Version: 8.0
 */
router.post('/webhook', express.json(), async (req, res) => {
  try {
    console.log('[ClickBank v8] ========== WEBHOOK REQUEST RECEIVED ==========');
    console.log('[ClickBank v8] Headers:', Object.keys(req.headers));
    console.log('[ClickBank v8] Body:', JSON.stringify(req.body, null, 2));

    const {
      transactionType,
      receipt,
      receiptNumber,
      itemNo,
      itemNumber,
      email,
      customerEmail,
      customer
    } = req.body;

    const userEmail = email || customerEmail || customer?.email;
    const itemNum = itemNo || itemNumber;

    if (!userEmail) {
      console.warn('[ClickBank v8] ⚠️  No email found in webhook');
      return res.sendStatus(200);
    }

    console.log(`[ClickBank v8] Transaction: ${transactionType} | Receipt: ${receipt || receiptNumber} | Email: ${userEmail} | Item: ${itemNum}`);

    if (transactionType === 'SALE' || transactionType === 'TEST') {
      console.log('[ClickBank v8] ✅ Processing SALE/TEST:', userEmail, receipt || receiptNumber, itemNum);
      
      // Build params object for processClickBankOrder (compatible format)
      const params = {
        transactionType: transactionType,
        receipt: receipt || receiptNumber,
        receiptNumber: receipt || receiptNumber,
        itemNo: itemNum,
        itemNumber: itemNum,
        customerEmail: userEmail,
        email: userEmail,
        customerName: customer?.name || customer?.firstName || '',
        customerFirstName: customer?.firstName || '',
        customerLastName: customer?.lastName || '',
      };

      // Process the order (creates account, activates module, etc.)
      const result = await processClickBankOrder(params);

      if (result.skipped) {
        console.log(`[ClickBank v8] ⚠️  Order skipped: ${result.reason}`);
        return res.sendStatus(200);
      }

      if (result.success) {
        console.log(`[ClickBank v8] ✅ Account created successfully for ${result.email}`);
        return res.sendStatus(200);
      } else {
        console.error('[ClickBank v8] ❌ Failed to process order:', result);
        return res.sendStatus(500);
      }
    }

    if (transactionType === 'REFUND' || transactionType === 'CANCEL') {
      console.log('[ClickBank v8] ⚠️  Processing REFUND/CANCEL:', userEmail, receipt || receiptNumber);
      // TODO: Implement access disabling logic
      // disableAccess(userEmail)
      return res.sendStatus(200);
    }

    // Unknown transaction type - log but return 200
    console.log(`[ClickBank v8] ⚠️  Unknown transaction type: ${transactionType}`);
    return res.sendStatus(200);
  } catch (err) {
    console.error('[ClickBank v8] ❌ ERROR:', err);
    console.error('[ClickBank v8] Error details:', {
      message: err.message,
      stack: err.stack,
    });
    return res.sendStatus(500);
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

