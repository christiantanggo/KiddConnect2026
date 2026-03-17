// routes/demo-followup.js
// Handles 24-hour follow-up emails for demo users who haven't signed up

import express from "express";
import { supabaseClient } from "../config/database.js";
import { sendEmail } from "../services/notifications.js";

const router = express.Router();

/**
 * Check and send 24-hour follow-up emails for demo users who haven't signed up
 * This should be called periodically (e.g., via cron job or scheduled task)
 * GET /api/demo-followup/check-and-send
 */
router.get("/check-and-send", async (req, res) => {
  try {
    console.log('[Demo Follow-up] Checking for demo emails that need follow-up...');
    
    // Find emails that:
    // 1. Were created more than 24 hours ago
    // 2. Haven't had follow-up sent yet (follow_up_sent = false)
    // 3. Haven't signed up yet (signed_up = false)
    // 4. Have marketing consent (marketing_consent = true)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { data: pendingFollowUps, error: queryError } = await supabaseClient
      .from('demo_emails')
      .select('*')
      .eq('follow_up_sent', false)
      .eq('signed_up', false)
      .eq('marketing_consent', true)
      .lt('created_at', twentyFourHoursAgo);
    
    if (queryError) {
      console.error('[Demo Follow-up] Error querying demo emails:', queryError);
      return res.status(500).json({ error: 'Failed to query demo emails', details: queryError.message });
    }
    
    if (!pendingFollowUps || pendingFollowUps.length === 0) {
      console.log('[Demo Follow-up] No pending follow-up emails found');
      return res.json({
        success: true,
        message: 'No pending follow-up emails',
        count: 0,
      });
    }
    
    console.log(`[Demo Follow-up] Found ${pendingFollowUps.length} demo emails needing follow-up`);
    
    const frontendUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'https://www.kiddconnect.com';
    let sentCount = 0;
    let errorCount = 0;
    
    // Send follow-up email to each
    for (const demoEmail of pendingFollowUps) {
      try {
        const subject = `Ready to go live with ${demoEmail.business_name || 'your AI assistant'}?`;
        
        const bodyText = `Hi there!\n\nYou tried our AI assistant demo 24 hours ago for ${demoEmail.business_name || 'your business'}.\n\nReady to answer your phone calls 24/7?\n\nGet started in just 10 minutes:\n${frontendUrl}/signup\n\nQuestions? Just reply to this email.\n\nBest,\nThe Tavari Team`;
        
        const bodyHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Ready to go live?</h2>
            <p style="color: #374151; font-size: 16px; line-height: 1.6;">
              Hi there!
            </p>
            <p style="color: #374151; font-size: 16px; line-height: 1.6;">
              You tried our AI assistant demo 24 hours ago${demoEmail.business_name ? ` for <strong>${demoEmail.business_name}</strong>` : ''}.
            </p>
            <p style="color: #374151; font-size: 16px; line-height: 1.6;">
              Ready to answer your phone calls 24/7?
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${frontendUrl}/signup" style="display: inline-block; background: #2563eb; color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 18px;">
                Get Started in 10 Minutes
              </a>
            </div>
            <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
              Questions? Just reply to this email.
            </p>
            <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
              Best,<br>The Tavari Team
            </p>
          </div>
        `;
        
        await sendEmail(demoEmail.email, subject, bodyText, bodyHtml, "Tavari", null);
        
        // Mark as sent
        await supabaseClient
          .from('demo_emails')
          .update({ 
            follow_up_sent: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', demoEmail.id);
        
        console.log(`[Demo Follow-up] ✅ Sent follow-up email to: ${demoEmail.email}`);
        sentCount++;
      } catch (emailError) {
        console.error(`[Demo Follow-up] ❌ Error sending follow-up to ${demoEmail.email}:`, emailError);
        errorCount++;
      }
    }
    
    res.json({
      success: true,
      message: `Processed ${pendingFollowUps.length} follow-up emails`,
      sent: sentCount,
      errors: errorCount,
    });
  } catch (error) {
    console.error('[Demo Follow-up] Error:', error);
    res.status(500).json({
      error: 'Failed to process follow-up emails',
      details: error.message,
    });
  }
});

/**
 * Mark a demo email as signed up (called when user signs up)
 * POST /api/demo-followup/mark-signed-up
 */
router.post("/mark-signed-up", async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    // Mark as signed up
    const { data, error } = await supabaseClient
      .from('demo_emails')
      .update({
        signed_up: true,
        signed_up_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('email', email)
      .select();
    
    if (error) {
      console.error('[Demo Follow-up] Error marking as signed up:', error);
      return res.status(500).json({ error: 'Failed to update demo email', details: error.message });
    }
    
    console.log(`[Demo Follow-up] ✅ Marked ${email} as signed up`);
    
    res.json({
      success: true,
      message: 'Demo email marked as signed up',
      updated: data,
    });
  } catch (error) {
    console.error('[Demo Follow-up] Error:', error);
    res.status(500).json({
      error: 'Failed to mark as signed up',
      details: error.message,
    });
  }
});

export default router;

