// routes/account.js
// Account management routes (cancellation, deletion, data export)

import express from "express";
import { authenticate } from "../middleware/auth.js";
import { Business } from "../models/Business.js";
import { User } from "../models/User.js";
import { CallSession } from "../models/CallSession.js";
import { Message } from "../models/Message.js";
import { AIAgent } from "../models/AIAgent.js";
import { getInvoicesByBusiness } from "../services/invoices.js";
import { supabaseClient } from "../config/database.js";
import { HelcimService } from "../services/helcim.js";

const router = express.Router();

// Cancel subscription
router.post("/cancel", authenticate, async (req, res) => {
  try {
    const { cancel_immediately = false } = req.body;
    const business = await Business.findById(req.businessId);

    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }

    if (business.helcim_subscription_id) {
      await HelcimService.cancelSubscription(
        business.helcim_subscription_id,
        cancel_immediately
      );
    }

    const cancellationDate = cancel_immediately
      ? new Date()
      : new Date(business.next_billing_date || new Date());

    await Business.update(req.businessId, {
      cancellation_requested_at: new Date().toISOString(),
      cancellation_effective_date: cancellationDate.toISOString().split("T")[0],
    });

    res.json({
      success: true,
      cancellation_effective_date: cancellationDate.toISOString().split("T")[0],
    });
  } catch (error) {
    console.error("Cancel subscription error:", error);
    res.status(500).json({ error: "Failed to cancel subscription" });
  }
});

// Delete account
router.post("/delete", authenticate, async (req, res) => {
  try {
    const { confirm_email } = req.body;
    const business = await Business.findById(req.businessId);

    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }

    if (confirm_email !== business.email) {
      return res.status(400).json({ error: "Email confirmation does not match" });
    }

    // Cancel Helcim subscription
    if (business.helcim_subscription_id) {
      try {
        await HelcimService.cancelSubscription(business.helcim_subscription_id, true);
      } catch (error) {
        console.error("Error canceling Helcim subscription:", error);
      }
    }

    // Delete VAPI assistant and phone number (if exists)
    if (business.vapi_assistant_id) {
      try {
        const { updateAssistant } = await import("../services/vapi.js");
        // VAPI deletion would be handled here
      } catch (error) {
        console.error("Error deleting VAPI resources:", error);
      }
    }

    // Mark for deletion
    await Business.update(req.businessId, {
      deletion_requested_at: new Date().toISOString(),
      deleted_at: new Date().toISOString(),
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Delete account error:", error);
    res.status(500).json({ error: "Failed to delete account" });
  }
});

// Export account data (GDPR/CCPA compliance)
router.get("/export", authenticate, async (req, res) => {
  try {
    const business = await Business.findById(req.businessId);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }

    const user = await User.findById(req.user.id);
    const agent = await AIAgent.findByBusinessId(req.businessId);
    const calls = await CallSession.findByBusinessId(req.businessId, 1000);
    const messages = await Message.findByBusinessId(req.businessId, 1000);
    const invoices = await getInvoicesByBusiness(req.businessId, 1000);

    const exportData = {
      business: {
        id: business.id,
        name: business.name,
        email: business.email,
        phone: business.phone,
        address: business.address,
        timezone: business.timezone,
        created_at: business.created_at,
      },
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        created_at: user.created_at,
      },
      agent: agent ? {
        greeting_text: agent.greeting_text,
        business_hours: agent.business_hours,
        faqs: agent.faqs,
      } : null,
      calls: calls.map((call) => ({
        id: call.id,
        caller_number: call.caller_number,
        caller_name: call.caller_name,
        duration_seconds: call.duration_seconds,
        transcript: call.transcript,
        intent: call.intent,
        started_at: call.started_at,
        ended_at: call.ended_at,
      })),
      messages: messages.map((msg) => ({
        id: msg.id,
        caller_name: msg.caller_name,
        caller_phone: msg.caller_phone,
        caller_email: msg.caller_email,
        message_text: msg.message_text,
        reason: msg.reason,
        created_at: msg.created_at,
      })),
      invoices: invoices.map((inv) => ({
        invoice_number: inv.invoice_number,
        amount: inv.amount,
        invoice_type: inv.invoice_type,
        period_start: inv.period_start,
        period_end: inv.period_end,
        created_at: inv.created_at,
      })),
      exported_at: new Date().toISOString(),
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="tavari-export-${business.id}.json"`);
    res.json(exportData);
  } catch (error) {
    console.error("Export data error:", error);
    res.status(500).json({ error: "Failed to export data" });
  }
});

export default router;

