// routes/support.js
// Support ticket routes

import express from "express";
import { authenticate } from "../middleware/auth.js";
import { supabaseClient } from "../config/database.js";
import { sendSupportTicketNotification, sendEmail } from "../services/notifications.js";
import { Business } from "../models/Business.js";

const router = express.Router();

// Public contact form endpoint (no authentication required)
// POST /api/support/contact
router.post("/contact", async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    // Validate required fields
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ 
        error: "All fields are required: name, email, subject, and message" 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email address" });
    }

    // Map subject dropdown to readable format
    const subjectMap = {
      technical: "Technical Support",
      billing: "Billing & Payments",
      account: "Account Issues",
      feature: "Feature Request",
      other: "General Inquiry",
    };
    const readableSubject = subjectMap[subject] || subject;

    // Support email address
    const supportEmail = process.env.SUPPORT_EMAIL || "info@tanggo.ca";

    // Create email subject
    const emailSubject = `Contact Form: ${readableSubject} - ${name}`;

    // Create email body (HTML)
    const bodyHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">New Contact Form Submission</h2>
        
        <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>From:</strong> ${name}</p>
          <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
          <p><strong>Subject:</strong> ${readableSubject}</p>
        </div>
        
        <div style="background-color: #ffffff; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h3 style="color: #111827; margin-top: 0;">Message:</h3>
          <p style="color: #374151; white-space: pre-wrap;">${message.replace(/\n/g, '<br>')}</p>
        </div>
        
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          This message was sent from the Tavari customer support contact form.<br>
          You can reply directly to this email to respond to ${name}.
        </p>
      </div>
    `;

    // Create plain text version
    const bodyText = `
New Contact Form Submission

From: ${name}
Email: ${email}
Subject: ${readableSubject}

Message:
${message}

---
This message was sent from the Tavari customer support contact form.
You can reply directly to this email to respond to ${name}.
    `.trim();

    // Send email to support
    console.log(`[Support Contact] Sending contact form email from ${name} (${email})`);
    await sendEmail(supportEmail, emailSubject, bodyText, bodyHtml, "Tavari Support", null);

    // Send confirmation email to the user (optional but good practice)
    const confirmationSubject = "Thank you for contacting Tavari Support";
    const confirmationBodyHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Thank You for Contacting Us</h2>
        <p>Hi ${name},</p>
        <p>We've received your message and our support team will get back to you as soon as possible.</p>
        <p><strong>Your inquiry:</strong> ${readableSubject}</p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          If you have any urgent questions, please don't hesitate to reach out to us directly at <a href="mailto:${supportEmail}">${supportEmail}</a>.
        </p>
        <p style="color: #6b7280; font-size: 14px;">
          Best regards,<br>
          The Tavari Support Team
        </p>
      </div>
    `;
    const confirmationBodyText = `
Thank You for Contacting Us

Hi ${name},

We've received your message and our support team will get back to you as soon as possible.

Your inquiry: ${readableSubject}

If you have any urgent questions, please don't hesitate to reach out to us directly at ${supportEmail}.

Best regards,
The Tavari Support Team
    `.trim();

    // Send confirmation email (non-blocking - don't fail if this fails)
    sendEmail(email, confirmationSubject, confirmationBodyText, confirmationBodyHtml, "Tavari", null)
      .catch(err => {
        console.warn(`[Support Contact] Failed to send confirmation email (non-blocking):`, err.message);
      });

    console.log(`[Support Contact] ✅ Contact form submission processed successfully`);
    res.status(200).json({ 
      success: true, 
      message: "Your message has been sent successfully. We'll get back to you soon!" 
    });
  } catch (error) {
    console.error("[Support Contact] Error processing contact form:", error);
    console.error("[Support Contact] Error details:", {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({ 
      error: "Failed to send message. Please try again later.",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Create support ticket
router.post("/tickets", authenticate, async (req, res) => {
  try {
    const { issue_type, description, urgency = "normal" } = req.body;

    if (!issue_type || !description) {
      return res.status(400).json({ error: "Issue type and description are required" });
    }

    const business = await Business.findById(req.businessId);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }

    const { data: ticket, error } = await supabaseClient
      .from("support_tickets")
      .insert({
        business_id: req.businessId,
        user_id: req.user.id,
        issue_type,
        description,
        urgency,
        status: "open",
      })
      .select()
      .single();

    if (error) throw error;

    // Send notification to Tavari support (non-blocking)
    sendSupportTicketNotification(ticket, business).catch((err) => {
      console.error("[Support] Failed to send ticket notification (non-blocking):", err);
    });

    res.status(201).json({ ticket });
  } catch (error) {
    console.error("Create ticket error:", error);
    console.error("Error details:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    res.status(500).json({ 
      error: "Failed to create support ticket",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get support tickets for business
router.get("/tickets", authenticate, async (req, res) => {
  try {
    const { data, error } = await supabaseClient
      .from("support_tickets")
      .select("*")
      .eq("business_id", req.businessId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    res.json({ tickets: data || [] });
  } catch (error) {
    console.error("Get tickets error:", error);
    console.error("Error details:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    res.status(500).json({ 
      error: "Failed to get support tickets",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get single support ticket for business
router.get("/tickets/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabaseClient
      .from("support_tickets")
      .select("*")
      .eq("id", id)
      .eq("business_id", req.businessId)
      .single();

    if (error) throw error;
    
    if (!data) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    res.json({ ticket: data });
  } catch (error) {
    console.error("Get ticket error:", error);
    console.error("Error details:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    res.status(500).json({ 
      error: "Failed to get support ticket",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Add response to support ticket (customer)
router.post("/tickets/:id/response", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { response_text } = req.body;
    
    if (!response_text || !response_text.trim()) {
      return res.status(400).json({ error: "Response text is required" });
    }

    // First verify the ticket belongs to this business
    const { data: ticket, error: ticketError } = await supabaseClient
      .from("support_tickets")
      .select("*")
      .eq("id", id)
      .eq("business_id", req.businessId)
      .single();

    if (ticketError) throw ticketError;
    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    // Update ticket with customer response in resolution_notes
    const currentNotes = ticket.resolution_notes || "";
    const timestamp = new Date().toLocaleString();
    const userName = req.user.first_name || req.user.email || "Customer";
    const newNotes = currentNotes 
      ? `${currentNotes}\n\n--- Response from ${userName} (${timestamp}) ---\n${response_text}`
      : `--- Response from ${userName} (${timestamp}) ---\n${response_text}`;
    
    // Update status to in-progress if it was resolved/closed (reopening the conversation)
    let newStatus = ticket.status;
    if (ticket.status === "resolved" || ticket.status === "closed") {
      newStatus = "in-progress";
    } else if (ticket.status === "open") {
      newStatus = "in-progress";
    }
    
    const { data, error } = await supabaseClient
      .from("support_tickets")
      .update({
        resolution_notes: newNotes,
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    // TODO: Send email notification to admin about customer response
    // This could notify the support team that the customer has responded

    res.json({ ticket: data });
  } catch (error) {
    console.error("Add ticket response error:", error);
    console.error("Error details:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    res.status(500).json({ 
      error: "Failed to add ticket response",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;
