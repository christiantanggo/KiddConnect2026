// services/notifications.js
// Email and SMS notification service using Supabase Edge Function (mail-send) and Telnyx

import axios from "axios";
import { renderEmailTemplate } from "./emailTemplates.js";
import { formatPhoneNumber } from "../utils/phoneFormatter.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FROM_EMAIL = process.env.AWS_SES_FROM_EMAIL || "noreply@tanggo.ca";
const FROM_NAME = "Tavari";
const TELNYX_API_KEY = process.env.TELNYX_API_KEY;

/**
 * SMS footer that must be appended to all messages (TCPA compliance)
 */
const SMS_FOOTER = "\n\nMSG & Data Rates Apply\nSTOP=stop, START=start";

/**
 * Add required footer to SMS message text
 * @param {string} messageText - Original message text
 * @returns {string} Message text with footer appended
 */
export function addSMSFooter(messageText) {
  // Remove any existing footer if present (to avoid duplicates)
  const footerPattern = /\n\nMSG & Data Rates Apply[\s\S]*STOP=stop, START=start$/;
  const cleanedText = messageText.replace(footerPattern, '').trim();
  
  // Add footer
  return cleanedText + SMS_FOOTER;
}

/**
 * Add business name identification to SMS message (TCPA/CTIA compliance requirement)
 * Business name must be included in every message so recipients know who is texting them
 * @param {string} messageText - Original message text
 * @param {string} businessName - Business name to identify sender
 * @returns {string} Message text with business name prepended
 */
export function addBusinessIdentification(messageText, businessName) {
  if (!businessName) {
    console.warn('[SMS Compliance] ⚠️  No business name provided - message may not be TCPA compliant');
    return messageText;
  }
  
  // Check if business name is already in the message (to avoid duplicates)
  // Look for business name at the start of the message
  const namePattern = new RegExp(`^\\s*${businessName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s:,\\-]`, 'i');
  
  if (namePattern.test(messageText)) {
    // Business name already present, return as-is
    return messageText;
  }
  
  // Prepend business name with a colon or dash for clarity
  // Format: "BusinessName: Message text..."
  return `${businessName}: ${messageText.trim()}`;
}

/**
 * Send SMS directly via Telnyx API (reusable function)
 * Automatically adds required footer to all messages
 * @param {string} fromNumber - Sender phone number (E.164 format)
 * @param {string} toNumber - Recipient phone number (E.164 format)
 * @param {string} messageText - SMS message text (footer will be added automatically)
 * @param {string|boolean} businessNameOrSkipFooter - Optional: business name (ignored, for backward compatibility) or boolean to skip footer
 * @param {boolean} skipFooter - Optional: set to true to skip adding footer (for internal use only)
 * @returns {Promise<Object>} Telnyx API response
 */
export async function sendSMSDirect(fromNumber, toNumber, messageText, businessNameOrSkipFooter = false, skipFooter = false) {
  if (!TELNYX_API_KEY) {
    throw new Error("TELNYX_API_KEY not configured");
  }
  
  // Format phone numbers for Telnyx (remove any formatting, ensure it starts with +)
  let formattedFrom = fromNumber.replace(/[^0-9+]/g, "");
  if (!formattedFrom.startsWith("+")) {
    formattedFrom = "+" + formattedFrom;
  }
  
  let formattedTo = toNumber.replace(/[^0-9+]/g, "");
  if (!formattedTo.startsWith("+")) {
    formattedTo = "+" + formattedTo;
  }
  
  // Handle parameter: if businessNameOrSkipFooter is a boolean, treat it as skipFooter
  // If it's a string (business name), ignore it (business identification should already be in messageText)
  const actualSkipFooter = typeof businessNameOrSkipFooter === 'boolean' ? businessNameOrSkipFooter : skipFooter;
  
  // Add required footer to all SMS messages (TCPA compliance)
  const finalMessageText = actualSkipFooter ? messageText : addSMSFooter(messageText);
  
  // Add timeout to prevent hanging (30 seconds)
  const response = await axios.post(
    "https://api.telnyx.com/v2/messages",
    {
      from: formattedFrom,
      to: formattedTo,
      text: finalMessageText,
    },
    {
      headers: {
        Authorization: `Bearer ${TELNYX_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 30000, // 30 second timeout to prevent hanging
    }
  );
  
  return response;
}

/**
 * Send email using Supabase Edge Function (mail-send)
 */
export async function sendEmail(to, subject, bodyText, bodyHtml = null, displayName = null, businessId = null, attachments = null) {
  console.log("[Notifications] ========== SEND EMAIL START ==========");
  console.log("[Notifications] To:", to);
  console.log("[Notifications] Subject:", subject);
  console.log("[Notifications] From Email:", FROM_EMAIL);
  console.log("[Notifications] From Name:", displayName || FROM_NAME);
  console.log("[Notifications] Business ID:", businessId);
  console.log("[Notifications] Has Attachments:", attachments ? attachments.length : 0);
  
  try {
    console.log("[Notifications] Step 1: Checking environment variables...");
    console.log("[Notifications] SUPABASE_URL:", SUPABASE_URL ? "SET" : "MISSING");
    console.log("[Notifications] SUPABASE_ANON_KEY:", SUPABASE_ANON_KEY ? "SET" : "MISSING");
    console.log("[Notifications] SUPABASE_SERVICE_ROLE_KEY:", SUPABASE_SERVICE_ROLE_KEY ? "SET" : "MISSING");
    console.log("[Notifications] FROM_EMAIL:", FROM_EMAIL);
    
    if (!SUPABASE_URL) {
      throw new Error("SUPABASE_URL must be set");
    }
    
    // Use service role key as fallback if anon key is not available
    const apiKey = SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY;
    if (!apiKey) {
      throw new Error("Either SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY must be set");
    }

    const emailPayload = {
      businessId: businessId || "system",
      campaignId: `email-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      contactId: `email-${to}-${Date.now()}`,
      to: to,
      fromEmail: FROM_EMAIL,
      fromName: displayName || FROM_NAME,
      subject: subject,
      html: bodyHtml || bodyText,
      text: bodyText,
    };

    if (attachments && attachments.length > 0) {
      emailPayload.attachments = attachments;
    }

    const edgeFunctionUrl = `${SUPABASE_URL}/functions/v1/mail-send`;
    console.log("[Notifications] Step 2: Calling Edge Function...");
    console.log("[Notifications] URL:", edgeFunctionUrl);
    console.log("[Notifications] Payload:", JSON.stringify({
      ...emailPayload,
      html: emailPayload.html ? `${emailPayload.html.substring(0, 100)}...` : null,
      text: emailPayload.text ? `${emailPayload.text.substring(0, 100)}...` : null,
    }, null, 2));

    const response = await fetch(edgeFunctionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": apiKey,
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(emailPayload),
    });

    console.log("[Notifications] Step 3: Edge Function response received");
    console.log("[Notifications] Status:", response.status);
    console.log("[Notifications] Status Text:", response.statusText);
    console.log("[Notifications] Headers:", Object.fromEntries(response.headers.entries()));

    const result = await response.json();
    console.log("[Notifications] Response body:", JSON.stringify(result, null, 2));
    
    if (!response.ok) {
      console.error("[Notifications] ❌ Edge Function returned error");
      throw new Error(result.error || `Email send failed: ${response.status}`);
    }
    
    console.log(`[Notifications] ✅ Email sent to ${to}: ${result.messageId || "success"}`);
    console.log("[Notifications] ========== SEND EMAIL SUCCESS ==========");
    return result;
  } catch (error) {
    console.error(`[Notifications] ========== SEND EMAIL ERROR ==========`);
    console.error(`[Notifications] Error sending email to ${to}:`, error.message);
    console.error(`[Notifications] Error stack:`, error.stack);
    console.error(`[Notifications] Full error:`, JSON.stringify(error, null, 2));
    throw error;
  }
}

/**
 * Send call summary email
 */
export async function sendCallSummaryEmail(business, callSession, transcript, summary, intent, message = null, forceEmail = false) {
  console.log("[Call Summary Email] ========== CALL SUMMARY EMAIL START ==========");
  console.log("[Call Summary Email] Business:", {
    id: business.id,
    name: business.name,
    email: business.email,
    email_ai_answered: business.email_ai_answered,
    forceEmail: forceEmail,
  });
  
  // CRITICAL: If forceEmail is true (for callbacks/messages), ALWAYS send email regardless of email_ai_answered setting
  if (!forceEmail && !business.email_ai_answered) {
    console.log("[Call Summary Email] ⚠️ Email disabled for AI-answered calls, skipping (not a callback/message)");
    return; // Email disabled for AI-answered calls (but not for callbacks/messages)
  }
  
  if (forceEmail) {
    console.log("[Call Summary Email] 🔥 FORCING EMAIL - This is a callback/message, email will be sent regardless of email_ai_answered setting");
  }

  // CRITICAL: Don't send email if summary is empty (summary not ready yet)
  // This prevents duplicate emails - one with "No summary available" and one with actual summary
  // Exception: Always send if there's a message (callback/message) even if summary is empty
  const hasSummary = summary && summary.trim().length > 0 && summary !== "No summary available";
  const hasTranscript = transcript && transcript.trim().length > 0 && transcript !== "No transcript available";
  const hasMessage = message && message.message_text && message.message_text.trim().length > 0;
  
  // Only send email if we have a summary (for regular calls) OR a message (for callback/message calls)
  // Don't send if we only have a transcript but no summary (wait for end-of-call-report event)
  if (!hasSummary && !hasMessage) {
    console.log("[Call Summary Email] ⚠️ Skipping email - summary is empty and no message (summary not ready yet). Will send when summary is available.");
    console.log("[Call Summary Email] Summary:", summary || "(empty)");
    console.log("[Call Summary Email] Transcript:", transcript ? `${transcript.substring(0, 50)}...` : "(empty)");
    console.log("[Call Summary Email] Message:", hasMessage ? "present" : "none");
    return; // Wait for next webhook event (end-of-call-report) that has the actual summary
  }

  try {
    console.log("[Call Summary Email] Step 1: Building template data...");
    const templateData = {
      business_name: business.name,
      caller_name: callSession.caller_name || message?.caller_name || "Unknown",
      caller_phone: formatPhoneNumber(callSession.caller_number || message?.caller_phone) || "Unknown",
      call_time: new Date(callSession.started_at).toLocaleString(),
      call_summary: summary || "No summary available",
      transcript: transcript || "No transcript available",
      message_taken: message ? true : false,
      message_text: message?.message_text || null,
      message_reason: message?.reason || null,
      caller_email: message?.caller_email || null,
    };

    // Try to use template, fallback to simple email if template doesn't exist
    let subject, bodyText, bodyHtml;
    try {
      const rendered = await renderEmailTemplate("call_summary", templateData);
      subject = rendered.subject;
      bodyText = rendered.bodyText;
      bodyHtml = rendered.bodyHtml;
    } catch (templateError) {
      // Template doesn't exist - create simple email
      console.warn(`[Notifications] Template not found, using fallback email`);
      subject = message 
        ? `New Message from ${templateData.caller_name} - ${business.name}`
        : `Call Summary - ${business.name}`;
      
      bodyText = message
        ? `New message received:\n\nCaller: ${templateData.caller_name}\nPhone: ${templateData.caller_phone}\n${templateData.caller_email ? `Email: ${templateData.caller_email}\n` : ''}Message: ${templateData.message_text}\n\nCall Summary: ${templateData.call_summary}`
        : `Call received from ${templateData.caller_name} (${templateData.caller_phone})\n\nSummary: ${templateData.call_summary}`;
      
      bodyHtml = message
        ? `<h2>New Message Received</h2><p><strong>Caller:</strong> ${templateData.caller_name}<br><strong>Phone:</strong> ${templateData.caller_phone}${templateData.caller_email ? `<br><strong>Email:</strong> ${templateData.caller_email}` : ''}</p><p><strong>Message:</strong> ${templateData.message_text}</p><p><strong>Call Summary:</strong> ${templateData.call_summary}</p>`
        : `<h2>Call Summary</h2><p><strong>Caller:</strong> ${templateData.caller_name}<br><strong>Phone:</strong> ${templateData.caller_phone}</p><p><strong>Summary:</strong> ${templateData.call_summary}</p>`;
    }

    const displayName = `Tavari for ${business.name}`;
    
    console.log(`[Call Summary Email] Step 2: Sending email...`);
    console.log(`[Call Summary Email] To: ${business.email}`);
    console.log(`[Call Summary Email] Subject: ${subject}`);
    console.log(`[Call Summary Email] Display Name: ${displayName}`);
    await sendEmail(business.email, subject, bodyText, bodyHtml, displayName, business.id);
    console.log(`[Call Summary Email] ✅ Call summary email sent successfully`);
    console.log("[Call Summary Email] ========== CALL SUMMARY EMAIL SUCCESS ==========");
  } catch (error) {
    console.error(`[Call Summary Email] ========== CALL SUMMARY EMAIL ERROR ==========`);
    console.error(`[Call Summary Email] Error sending call summary email:`, error.message);
    console.error(`[Call Summary Email] Error stack:`, error.stack);
    console.error(`[Call Summary Email] Full error:`, JSON.stringify(error, null, 2));
    // Don't throw - email failures shouldn't break the call flow
  }
}

/**
 * Send emergency intake email with structured fields (name, callback number, service type, urgency, location, issue).
 * Used when someone calls the Emergency Network line and the AI collects their info.
 */
export async function sendEmergencyIntakeEmail(toEmail, request, options = {}) {
  if (!toEmail || !String(toEmail).trim()) {
    console.warn('[Emergency Intake Email] No recipient email, skipping');
    return;
  }
  const { transcript = '', summary = '', transcriptViewUrl = null } = options;
  const name = request.caller_name || 'Not provided';
  const phone = formatPhoneNumber(request.callback_phone) || request.callback_phone || 'Not provided';
  const serviceType = request.service_category || 'Not provided';
  const urgency = request.urgency_level || 'Not provided';
  const location = request.location || 'Not provided';
  const issue = request.issue_summary || 'Not provided';
  const customIntake = request.custom_intake && typeof request.custom_intake === 'object' ? request.custom_intake : {};
  const subject = `Emergency Dispatch: ${serviceType} – ${urgency}`;
  const bodyText = [
    'Emergency Dispatch – New intake (phone)',
    '',
    `Name: ${name}`,
    `Callback number: ${phone}`,
    `Service type: ${serviceType}`,
    `Urgency: ${urgency}`,
    `Location: ${location}`,
    `Issue: ${issue}`,
    ...Object.entries(customIntake).map(([k, v]) => `${k}: ${v}`),
    '',
    summary ? `Summary: ${summary}` : '',
    transcript ? `Transcript:\n${transcript}` : '',
    transcriptViewUrl ? `View full transcript: ${transcriptViewUrl}` : '',
  ].filter(Boolean).join('\n');
  const bodyHtmlRows = [
    `<tr><td style="padding:6px 12px 6px 0; vertical-align:top; font-weight:bold;">Name</td><td style="padding:6px 0;">${escapeHtml(name)}</td></tr>`,
    `<tr><td style="padding:6px 12px 6px 0; vertical-align:top; font-weight:bold;">Callback number</td><td style="padding:6px 0;">${escapeHtml(phone)}</td></tr>`,
    `<tr><td style="padding:6px 12px 6px 0; vertical-align:top; font-weight:bold;">Service type</td><td style="padding:6px 0;">${escapeHtml(serviceType)}</td></tr>`,
    `<tr><td style="padding:6px 12px 6px 0; vertical-align:top; font-weight:bold;">Urgency</td><td style="padding:6px 0;">${escapeHtml(urgency)}</td></tr>`,
    `<tr><td style="padding:6px 12px 6px 0; vertical-align:top; font-weight:bold;">Location</td><td style="padding:6px 0;">${escapeHtml(location)}</td></tr>`,
    `<tr><td style="padding:6px 12px 6px 0; vertical-align:top; font-weight:bold;">Issue</td><td style="padding:6px 0;">${escapeHtml(issue)}</td></tr>`,
    ...Object.entries(customIntake).map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0; vertical-align:top; font-weight:bold;">${escapeHtml(k)}</td><td style="padding:6px 0;">${escapeHtml(String(v))}</td></tr>`),
  ];
  const bodyHtml = [
    '<h2>Emergency Dispatch – New intake (phone)</h2>',
    '<table style="border-collapse:collapse; max-width:560px;">',
    ...bodyHtmlRows,
    '</table>',
    summary ? `<p><strong>Summary</strong><br><pre style="white-space:pre-wrap; font-family:inherit;">${escapeHtml(summary)}</pre></p>` : '',
    transcript ? `<p><strong>Transcript</strong><br><pre style="white-space:pre-wrap; font-family:inherit; max-height:200px; overflow:auto;">${escapeHtml(transcript)}</pre></p>` : '',
    transcriptViewUrl ? `<p><a href="${escapeHtml(transcriptViewUrl)}" style="color:#0d9488;">View full transcript</a></p>` : '',
  ].filter(Boolean).join('\n');
  try {
    await sendEmail(toEmail.trim(), subject, bodyText, bodyHtml, 'Tavari Emergency Dispatch', null);
    console.log('[Emergency Intake Email] Sent to', toEmail.trim());
  } catch (err) {
    console.error('[Emergency Intake Email] Failed:', err?.message || err);
    throw err;
  }
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Send SMS notification (premium, 3x Telnyx cost)
 */
export async function sendSMSNotification(business, callSession, summary, message = null) {
  console.log("[SMS Notification] ========== SMS NOTIFICATION START ==========");
  console.log("[SMS Notification] Business:", {
    id: business.id,
    name: business.name,
    sms_enabled: business.sms_enabled,
    sms_notification_number: business.sms_notification_number,
    vapi_phone_number: business.vapi_phone_number,
  });
  
  if (!business.sms_enabled || !business.sms_notification_number) {
    console.log("[SMS Notification] ⚠️ SMS disabled or no notification number configured, skipping");
    return; // SMS disabled or no number configured
  }

  // Use the business's VAPI phone number as the sender (their business number)
  if (!business.vapi_phone_number) {
    console.error("[SMS Notification] ❌ Business phone number not provisioned - cannot send SMS");
    return;
  }

  console.log("[SMS Notification] Step 1: Checking Telnyx configuration...");
  console.log("[SMS Notification] TELNYX_API_KEY:", TELNYX_API_KEY ? "SET" : "MISSING");
  console.log("[SMS Notification] Business phone (FROM):", business.vapi_phone_number);
  console.log("[SMS Notification] Notification number (TO):", business.sms_notification_number);

  if (!TELNYX_API_KEY) {
    console.warn("[SMS Notification] ❌ Telnyx API key not configured");
    return;
  }

  try {
    // Build message text - include message details if available
    let messageText;
    if (message && message.message_text) {
      messageText = `New callback request from ${message.caller_name || callSession.caller_name || "Unknown"} (${formatPhoneNumber(message.caller_phone || callSession.caller_number)}). ${message.message_text.substring(0, 150)}`;
    } else {
      messageText = `New callback request from ${callSession.caller_name || "Unknown"} (${formatPhoneNumber(callSession.caller_number)}). ${summary?.substring(0, 100) || "See dashboard for details."}`;
    }
    
    // Add business name identification for TCPA/CTIA compliance
    messageText = addBusinessIdentification(messageText, business.name);
    
    console.log("[SMS Notification] Step 2: Building SMS message");
    console.log("[SMS Notification] Message:", messageText);
    
    // Format phone number for Telnyx (remove any formatting, ensure it starts with +)
    let fromNumber = business.vapi_phone_number.replace(/[^0-9+]/g, "");
    if (!fromNumber.startsWith("+")) {
      fromNumber = "+" + fromNumber;
    }
    
    let toNumber = business.sms_notification_number.replace(/[^0-9+]/g, "");
    if (!toNumber.startsWith("+")) {
      toNumber = "+" + toNumber;
    }
    
    console.log("[SMS Notification] From (formatted):", fromNumber);
    console.log("[SMS Notification] To (formatted):", toNumber);

    console.log("[SMS Notification] Step 3: Sending SMS via Telnyx API...");
    const response = await sendSMSDirect(fromNumber, toNumber, messageText);

    console.log(`[SMS Notification] ✅ SMS sent to ${business.sms_notification_number}`);
    console.log("[SMS Notification] Response:", JSON.stringify(response, null, 2));
    console.log("[SMS Notification] Message ID:", response.data?.id);
    console.log("[SMS Notification] ========== SMS NOTIFICATION SUCCESS ==========");
    
    // Track SMS cost (3x Telnyx rate)
    // This will be handled by usage tracking service
    return response.data;
  } catch (error) {
    console.error(`[SMS Notification] ========== SMS NOTIFICATION ERROR ==========`);
    console.error(`[SMS Notification] Error sending SMS:`, error.message);
    console.error(`[SMS Notification] Error response:`, error.response?.data);
    console.error(`[SMS Notification] Error stack:`, error.stack);
    console.error(`[SMS Notification] Full error:`, JSON.stringify(error, null, 2));
    // Don't throw - SMS failures shouldn't break the call flow
  }
}

/**
 * Send SMS notification for new emergency dispatch intake (same idea as sendSMSNotification for AI phone agent).
 * Used when someone calls the Emergency Network line and the AI creates a service request.
 * @param {Object} config - Emergency config: emergency_phone_numbers, notification_sms_number, sms_enabled, service_line_name
 * @param {Object} request - Intake payload: caller_name, callback_phone, service_category, urgency_level, location, issue_summary
 */
export async function sendEmergencyIntakeSMS(config, request) {
  if (!config.sms_enabled || !config.notification_sms_number) {
    return;
  }
  const numbers = config.emergency_phone_numbers || [];
  const fromNumber = numbers[0] && String(numbers[0]).trim();
  if (!fromNumber) {
    console.warn('[Emergency Intake SMS] No emergency FROM number configured');
    return;
  }
  if (!TELNYX_API_KEY) {
    console.warn('[Emergency Intake SMS] TELNYX_API_KEY not configured');
    return;
  }
  const name = request.caller_name || 'Unknown';
  const phone = formatPhoneNumber(request.callback_phone) || request.callback_phone || 'N/A';
  const service = request.service_category || 'Service';
  const urgency = request.urgency_level || '';
  const messageText = addBusinessIdentification(
    `New emergency request from ${name} (${phone}). ${service}${urgency ? ` – ${urgency}` : ''}. See dashboard for details.`,
    config.service_line_name || 'Emergency Dispatch'
  );
  let fromE164 = fromNumber.replace(/[^0-9+]/g, '');
  if (!fromE164.startsWith('+')) fromE164 = fromE164.length === 10 ? `+1${fromE164}` : `+${fromE164}`;
  let toE164 = String(config.notification_sms_number).replace(/[^0-9+]/g, '');
  if (!toE164.startsWith('+')) toE164 = toE164.length === 10 ? `+1${toE164}` : `+${toE164}`;
  try {
    await sendSMSDirect(fromE164, toE164, messageText);
    console.log('[Emergency Intake SMS] Sent to', config.notification_sms_number);
  } catch (err) {
    console.error('[Emergency Intake SMS] Failed:', err?.message || err);
    throw err;
  }
}

/**
 * Send escalation email when AI has exhausted all providers (Needs Manual Assist).
 * Same recipient as intake: notification_email (Tavari employee).
 */
export async function sendEmergencyEscalationEmail(toEmail, request) {
  if (!toEmail || !String(toEmail).trim()) {
    console.warn('[Emergency Escalation Email] No recipient email, skipping');
    return;
  }
  const name = request.caller_name || 'Not provided';
  const phone = formatPhoneNumber(request.callback_phone) || request.callback_phone || 'Not provided';
  const serviceType = request.service_category || 'Not provided';
  const urgency = request.urgency_level || 'Not provided';
  const location = request.location || 'Not provided';
  const issue = request.issue_summary || 'Not provided';
  const subject = `[ESCALATION] Emergency Dispatch: All providers exhausted – ${serviceType} – ${urgency}`;
  const bodyText = [
    'Emergency Dispatch – ESCALATION (all providers exhausted)',
    '',
    'The AI has tried all available providers. This request needs manual follow-up.',
    '',
    `Request ID: ${request.id}`,
    `Name: ${name}`,
    `Callback number: ${phone}`,
    `Service type: ${serviceType}`,
    `Urgency: ${urgency}`,
    `Location: ${location}`,
    `Issue: ${issue}`,
    '',
    'Log in to Emergency Dispatch to assign or call the customer.',
  ].join('\n');
  const bodyHtml = [
    '<h2>Emergency Dispatch – ESCALATION</h2>',
    '<p><strong>The AI has tried all available providers. This request needs manual follow-up.</strong></p>',
    '<table style="border-collapse:collapse; max-width:560px;">',
    `<tr><td style="padding:6px 12px 6px 0; vertical-align:top; font-weight:bold;">Request ID</td><td style="padding:6px 0;">${escapeHtml(request.id)}</td></tr>`,
    `<tr><td style="padding:6px 12px 6px 0; vertical-align:top; font-weight:bold;">Name</td><td style="padding:6px 0;">${escapeHtml(name)}</td></tr>`,
    `<tr><td style="padding:6px 12px 6px 0; vertical-align:top; font-weight:bold;">Callback number</td><td style="padding:6px 0;">${escapeHtml(phone)}</td></tr>`,
    `<tr><td style="padding:6px 12px 6px 0; vertical-align:top; font-weight:bold;">Service type</td><td style="padding:6px 0;">${escapeHtml(serviceType)}</td></tr>`,
    `<tr><td style="padding:6px 12px 6px 0; vertical-align:top; font-weight:bold;">Urgency</td><td style="padding:6px 0;">${escapeHtml(urgency)}</td></tr>`,
    `<tr><td style="padding:6px 12px 6px 0; vertical-align:top; font-weight:bold;">Location</td><td style="padding:6px 0;">${escapeHtml(location)}</td></tr>`,
    `<tr><td style="padding:6px 12px 6px 0; vertical-align:top; font-weight:bold;">Issue</td><td style="padding:6px 0;">${escapeHtml(issue)}</td></tr>`,
    '</table>',
    '<p>Log in to Emergency Dispatch to assign or call the customer.</p>',
  ].join('\n');
  try {
    await sendEmail(toEmail.trim(), subject, bodyText, bodyHtml, 'Tavari Emergency Dispatch', null);
    console.log('[Emergency Escalation Email] Sent to', toEmail.trim());
  } catch (err) {
    console.error('[Emergency Escalation Email] Failed:', err?.message || err);
    throw err;
  }
}

/**
 * Send escalation SMS when AI has exhausted all providers (Needs Manual Assist).
 * Same recipient as intake: notification_sms_number (Tavari employee).
 */
export async function sendEmergencyEscalationSMS(config, request) {
  if (!config.sms_enabled || !config.notification_sms_number) {
    return;
  }
  const numbers = config.emergency_phone_numbers || [];
  const fromNumber = numbers[0] && String(numbers[0]).trim();
  if (!fromNumber) {
    console.warn('[Emergency Escalation SMS] No emergency FROM number configured');
    return;
  }
  if (!TELNYX_API_KEY) {
    console.warn('[Emergency Escalation SMS] TELNYX_API_KEY not configured');
    return;
  }
  const name = request.caller_name || 'Unknown';
  const phone = formatPhoneNumber(request.callback_phone) || request.callback_phone || 'N/A';
  const messageText = addBusinessIdentification(
    `ESCALATION: All providers exhausted. Request from ${name} (${phone}). Status: Needs Manual Assist. Log in to Emergency Dispatch.`,
    config.service_line_name || 'Emergency Dispatch'
  );
  let fromE164 = fromNumber.replace(/[^0-9+]/g, '');
  if (!fromE164.startsWith('+')) fromE164 = fromE164.length === 10 ? `+1${fromE164}` : `+${fromE164}`;
  let toE164 = String(config.notification_sms_number).replace(/[^0-9+]/g, '');
  if (!toE164.startsWith('+')) toE164 = toE164.length === 10 ? `+1${toE164}` : `+${toE164}`;
  try {
    await sendSMSDirect(fromE164, toE164, messageText);
    console.log('[Emergency Escalation SMS] Sent to', config.notification_sms_number);
  } catch (err) {
    console.error('[Emergency Escalation SMS] Failed:', err?.message || err);
    throw err;
  }
}

/** Default message body for customer confirmation SMS when not configured. */
const DEFAULT_CUSTOMER_SMS_MESSAGE = "Hi {{caller_name}}, we've received your {{service_category}} request ({{urgency_level}}). Location: {{location}}. Issue: {{issue_summary}}. Our dispatch team is looking for a provider and will contact you once someone is assigned.";
/** Default legal disclaimer when not configured. {{terms_url}} is replaced with config.terms_of_service_url or Tavari terms URL */
const DEFAULT_CUSTOMER_SMS_LEGAL = "We are a dispatch service only, not the provider. You are responsible for verifying the provider's license, insurance, and terms when they contact you. Terms: {{terms_url}}";

/**
 * Replace placeholders in a template with request fields. Placeholders: {{caller_name}}, {{service_category}}, {{urgency_level}}, {{location}}, {{issue_summary}}.
 */
function replaceCustomerSmsPlaceholders(text, request) {
  if (!text || typeof text !== 'string') return '';
  const name = request.caller_name || 'there';
  const service = request.service_category || 'service';
  const urgency = request.urgency_level || '';
  const location = request.location || 'Not provided';
  const issue = (request.issue_summary || '').slice(0, 200);
  return text
    .replace(/\{\{caller_name\}\}/g, name)
    .replace(/\{\{service_category\}\}/g, service)
    .replace(/\{\{urgency_level\}\}/g, urgency)
    .replace(/\{\{location\}\}/g, location)
    .replace(/\{\{issue_summary\}\}/g, issue);
}

/**
 * Send SMS to the customer after phone intake: confirms details, says dispatch is looking, and includes legal disclaimer.
 * Content is built from config.customer_sms_message and config.customer_sms_legal (with placeholders). If either is empty, defaults are used.
 * @param {Object} config - Emergency config: emergency_phone_numbers, service_line_name, customer_sms_enabled, customer_sms_message, customer_sms_legal
 * @param {Object} request - Intake payload: caller_name, callback_phone, service_category, urgency_level, location, issue_summary
 */
export async function sendEmergencyCustomerConfirmationSMS(config, request) {
  if (!config.customer_sms_enabled) return;
  const numbers = config.emergency_phone_numbers || [];
  const fromNumber = numbers[0] && String(numbers[0]).trim();
  if (!fromNumber) {
    console.warn('[Emergency Customer SMS] No emergency FROM number configured');
    return;
  }
  if (!TELNYX_API_KEY) {
    console.warn('[Emergency Customer SMS] TELNYX_API_KEY not configured');
    return;
  }
  const toPhone = request.callback_phone;
  if (!toPhone || !String(toPhone).trim()) {
    console.warn('[Emergency Customer SMS] No customer callback phone');
    return;
  }
  const messageBody = (config.customer_sms_message && String(config.customer_sms_message).trim())
    ? replaceCustomerSmsPlaceholders(config.customer_sms_message.trim(), request)
    : replaceCustomerSmsPlaceholders(DEFAULT_CUSTOMER_SMS_MESSAGE, request);
  const legalBody = (config.customer_sms_legal && String(config.customer_sms_legal).trim())
    ? replaceCustomerSmsPlaceholders(config.customer_sms_legal.trim(), request)
    : replaceCustomerSmsPlaceholders(DEFAULT_CUSTOMER_SMS_LEGAL, request);
  let fullText = legalBody ? `${messageBody}\n\n${legalBody}` : messageBody;
  const termsUrl = (config.terms_of_service_url && String(config.terms_of_service_url).trim()) || 'https://www.tavarios.com/termsofservice';
  fullText = fullText.replace(/\{\{terms_url\}\}/g, termsUrl);
  const messageText = addBusinessIdentification(fullText, config.service_line_name || 'Emergency Dispatch');
  let fromE164 = fromNumber.replace(/[^0-9+]/g, '');
  if (!fromE164.startsWith('+')) fromE164 = fromE164.length === 10 ? `+1${fromE164}` : `+${fromE164}`;
  let toE164 = String(toPhone).replace(/[^0-9+]/g, '');
  if (!toE164.startsWith('+')) toE164 = toE164.length === 10 ? `+1${toE164}` : `+${toE164}`;
  try {
    await sendSMSDirect(fromE164, toE164, messageText);
    console.log('[Emergency Customer SMS] Sent to customer', toE164);
  } catch (err) {
    console.error('[Emergency Customer SMS] Failed:', err?.message || err);
    throw err;
  }
}

/**
 * Send usage notification (minutes almost used)
 */
export async function sendMinutesAlmostUsedNotification(business, minutesUsed, minutesTotal, minutesRemaining, resetDate) {
  if (!business.notify_minutes_almost_used) {
    return; // Notification disabled
  }

  try {
    const usagePercent = Math.round((minutesUsed / minutesTotal) * 100);
    const templateData = {
      minutes_used: minutesUsed,
      minutes_total: minutesTotal,
      usage_percent: usagePercent,
      minutes_remaining: minutesRemaining,
      reset_date: resetDate.toLocaleDateString(),
    };

    const { subject, bodyText, bodyHtml } = await renderEmailTemplate("minutes_almost_used", templateData);
    const displayName = `Tavari for ${business.name}`;

    await sendEmail(business.email, subject, bodyText, bodyHtml, displayName, business.id);
  } catch (error) {
    console.error(`[Notifications] Error sending minutes almost used notification:`, error);
  }
}

/**
 * Send minutes fully used notification
 */
export async function sendMinutesFullyUsedNotification(business, minutesTotal, resetDate, optionA = true) {
  if (!business.notify_minutes_fully_used) {
    return; // Notification disabled (but mandatory notification will still be sent)
  }

  try {
    const templateData = {
      minutes_total: minutesTotal,
      option_a: optionA,
      option_b: !optionA,
      reset_date: resetDate.toLocaleDateString(),
    };

    const { subject, bodyText, bodyHtml } = await renderEmailTemplate("minutes_fully_used", templateData);
    const displayName = `Tavari for ${business.name}`;

    await sendEmail(business.email, subject, bodyText, bodyHtml, displayName, business.id);
  } catch (error) {
    console.error(`[Notifications] Error sending minutes fully used notification:`, error);
  }
}

/**
 * Send overage charges notification
 */
export async function sendOverageChargesNotification(business, overageMinutes, overageRate, overageAmount, overageCap) {
  if (!business.notify_overage_charges) {
    return; // Notification disabled
  }

  try {
    const templateData = {
      overage_minutes: overageMinutes,
      overage_rate: overageRate.toFixed(2),
      overage_amount: overageAmount.toFixed(2),
      overage_cap: overageCap,
    };

    const { subject, bodyText, bodyHtml } = await renderEmailTemplate("overage_charges", templateData);
    const displayName = `Tavari for ${business.name}`;

    await sendEmail(business.email, subject, bodyText, bodyHtml, displayName, business.id);
  } catch (error) {
    console.error(`[Notifications] Error sending overage charges notification:`, error);
  }
}

/**
 * Send mandatory AI disabled notification (cannot be disabled)
 */
export async function sendAIDisabledNotification(business, reason, details = {}) {
  try {
    let templateKey = "ai_disabled_manual";
    let templateData = { business_name: business.name };

    if (reason === "minutes_exhausted") {
      templateKey = "ai_disabled_minutes";
      templateData = {
        minutes_total: details.minutesTotal || business.usage_limit_minutes,
        reset_date: details.resetDate?.toLocaleDateString() || "Next billing date",
      };
    } else if (reason === "overage_cap") {
      templateKey = "ai_disabled_overage_cap";
      templateData = {
        overage_cap: details.overageCap || business.overage_cap_minutes,
        reset_date: details.resetDate?.toLocaleDateString() || "Next billing date",
      };
    } else if (reason === "payment_issue") {
      templateKey = "ai_disabled_payment";
      templateData = { business_name: business.name };
    }

    const { subject, bodyText, bodyHtml } = await renderEmailTemplate(templateKey, templateData);
    const displayName = `Tavari for ${business.name}`;

    await sendEmail(business.email, subject, bodyText, bodyHtml, displayName, business.id);
  } catch (error) {
    console.error(`[Notifications] Error sending AI disabled notification:`, error);
  }
}

/**
 * Send mandatory AI resumed notification (cannot be disabled)
 */
export async function sendAIResumedNotification(business, minutesTotal, resetDate) {
  try {
    const templateData = {
      minutes_total: minutesTotal,
      reset_date: resetDate.toLocaleDateString(),
    };

    const { subject, bodyText, bodyHtml } = await renderEmailTemplate("ai_resumed", templateData);
    const displayName = `Tavari for ${business.name}`;

    await sendEmail(business.email, subject, bodyText, bodyHtml, displayName, business.id);
  } catch (error) {
    console.error(`[Notifications] Error sending AI resumed notification:`, error);
  }
}

/**
 * Send invoice email with PDF attachment
 */
export async function sendInvoiceEmail(business, invoice, pdfBuffer) {
  try {
    const templateData = {
      invoice_number: invoice.invoice_number,
      amount: invoice.amount.toFixed(2),
      invoice_type: invoice.invoice_type,
      period_start: invoice.period_start?.toLocaleDateString() || "N/A",
      period_end: invoice.period_end?.toLocaleDateString() || "N/A",
      prorated_amount: invoice.prorated_amount ? invoice.prorated_amount.toFixed(2) : null,
      prorated_days: invoice.prorated_days || null,
    };

    const { subject, bodyText, bodyHtml } = await renderEmailTemplate("invoice", templateData);
    const displayName = `Tavari for ${business.name}`;

    // Convert PDF buffer to base64
    let attachments = null;
    if (pdfBuffer) {
      const base64PDF = pdfBuffer.toString('base64');
      attachments = [{
        filename: `Invoice-${invoice.invoice_number}.pdf`,
        content: base64PDF,
        contentType: 'application/pdf'
      }];
    }

    await sendEmail(business.email, subject, bodyText, bodyHtml, displayName, business.id, attachments);
  } catch (error) {
    console.error(`[Notifications] Error sending invoice email:`, error);
    throw error;
  }
}

/**
 * Send missed call notification (for calls forwarded during business hours)
 */
export async function sendMissedCallEmail(business, callSession) {
  console.log("[Missed Call Email] ========== MISSED CALL EMAIL START ==========");
  console.log("[Missed Call Email] Business:", {
    id: business.id,
    name: business.name,
    email: business.email,
    email_missed_calls: business.email_missed_calls,
  });
  
  if (!business.email_missed_calls) {
    console.log("[Missed Call Email] ⚠️ Email disabled for missed calls, skipping");
    return; // Email disabled for missed calls
  }

  try {
    console.log("[Missed Call Email] Step 1: Building template data...");
    const templateData = {
      business_name: business.name,
      caller_name: callSession.caller_name || "Unknown",
      caller_phone: formatPhoneNumber(callSession.caller_number) || "Unknown",
      call_time: new Date(callSession.started_at).toLocaleString(),
      call_duration: callSession.duration_seconds ? `${Math.floor(callSession.duration_seconds / 60)}m ${callSession.duration_seconds % 60}s` : "N/A",
      forward_reason: callSession.status === "forwarded_no_minutes" 
        ? "AI minutes exhausted" 
        : callSession.status === "forwarded_overage_cap" 
        ? "Overage cap reached" 
        : "AI disabled or call forwarded",
    };

    // Try to use template, fallback to simple email if template doesn't exist
    let subject, bodyText, bodyHtml;
    try {
      const rendered = await renderEmailTemplate("missed_call", templateData);
      subject = rendered.subject;
      bodyText = rendered.bodyText;
      bodyHtml = rendered.bodyHtml;
    } catch (templateError) {
      // Template doesn't exist - create simple email
      console.warn(`[Missed Call Email] Template not found, using fallback email`);
      subject = `Missed Call - ${business.name}`;
      
      bodyText = `A call was forwarded to your business but couldn't be answered:\n\nCaller: ${templateData.caller_name}\nPhone: ${templateData.caller_phone}\nTime: ${templateData.call_time}\nDuration: ${templateData.call_duration}\nReason: ${templateData.forward_reason}\n\nThis call was forwarded to your business number but may not have been answered.`;
      
      bodyHtml = `<h2>Missed Call Notification</h2>
        <p>A call was forwarded to your business but couldn't be answered:</p>
        <ul>
          <li><strong>Caller:</strong> ${templateData.caller_name}</li>
          <li><strong>Phone:</strong> ${templateData.caller_phone}</li>
          <li><strong>Time:</strong> ${templateData.call_time}</li>
          <li><strong>Duration:</strong> ${templateData.call_duration}</li>
          <li><strong>Reason:</strong> ${templateData.forward_reason}</li>
        </ul>
        <p>This call was forwarded to your business number but may not have been answered.</p>`;
    }

    const displayName = `Tavari for ${business.name}`;
    
    console.log(`[Missed Call Email] Step 2: Sending email...`);
    console.log(`[Missed Call Email] To: ${business.email}`);
    console.log(`[Missed Call Email] Subject: ${subject}`);
    console.log(`[Missed Call Email] Display Name: ${displayName}`);
    await sendEmail(business.email, subject, bodyText, bodyHtml, displayName, business.id);
    console.log(`[Missed Call Email] ✅ Missed call email sent successfully`);
    console.log("[Missed Call Email] ========== MISSED CALL EMAIL SUCCESS ==========");
  } catch (error) {
    console.error(`[Missed Call Email] ========== MISSED CALL EMAIL ERROR ==========`);
    console.error(`[Missed Call Email] Error sending missed call email:`, error.message);
    console.error(`[Missed Call Email] Error stack:`, error.stack);
    console.error(`[Missed Call Email] Full error:`, JSON.stringify(error, null, 2));
    // Don't throw - email failures shouldn't break the call flow
  }
}

/**
 * Send support ticket notification to Tavari staff
 */
export async function sendSupportTicketNotification(ticket, business) {
  try {
    const templateData = {
      ticket_id: ticket.id,
      business_name: business.name,
      issue_type: ticket.issue_type,
      description: ticket.description,
      urgency: ticket.urgency,
    };

    const { subject, bodyText, bodyHtml } = await renderEmailTemplate("support_ticket_created", templateData);

    // Send to Tavari support email
    const supportEmail = process.env.SUPPORT_EMAIL || "info@tanggo.ca";
    await sendEmail(supportEmail, subject, bodyText, bodyHtml, "Tavari Support", business.id);
  } catch (error) {
    console.error(`[Notifications] Error sending support ticket notification:`, error);
  }
}

/**
 * Send email notification to business when their support ticket is updated
 */
export async function sendSupportTicketUpdateNotification(ticket, business, updateType, adminName = null, responseText = null) {
  try {
    if (!business.email) {
      console.warn(`[Notifications] Business ${business.id} has no email, skipping ticket update notification`);
      return;
    }

    const ticketIdShort = ticket.id.substring(0, 8);
    let subject = "";
    let bodyText = "";
    let bodyHtml = "";

    if (updateType === "response") {
      subject = `Update on Your Support Ticket #${ticketIdShort}`;
      bodyText = `Hello ${business.name},\n\n` +
        `We have an update on your support ticket:\n\n` +
        `Ticket ID: ${ticket.id}\n` +
        `Issue Type: ${ticket.issue_type}\n` +
        `Status: ${ticket.status}\n\n` +
        `Response from ${adminName || "our support team"}:\n` +
        `${responseText}\n\n` +
        `You can view your ticket and respond at any time through your dashboard.\n\n` +
        `Thank you,\n` +
        `Tavari Support Team`;
      
      bodyHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Update on Your Support Ticket</h2>
          <p>Hello ${business.name},</p>
          <p>We have an update on your support ticket:</p>
          <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Ticket ID:</strong> ${ticket.id}</p>
            <p><strong>Issue Type:</strong> ${ticket.issue_type}</p>
            <p><strong>Status:</strong> ${ticket.status}</p>
          </div>
          <div style="background-color: #eff6ff; padding: 15px; border-left: 4px solid #2563eb; margin: 20px 0;">
            <p><strong>Response from ${adminName || "our support team"}:</strong></p>
            <p style="white-space: pre-wrap;">${responseText}</p>
          </div>
          <p>You can view your ticket and respond at any time through your dashboard.</p>
          <p>Thank you,<br>Tavari Support Team</p>
        </div>
      `;
    } else if (updateType === "status") {
      const statusMessages = {
        "in-progress": "is now being worked on",
        "resolved": "has been resolved",
        "closed": "has been closed",
      };
      const statusMessage = statusMessages[ticket.status] || "has been updated";
      
      subject = `Your Support Ticket #${ticketIdShort} ${statusMessage}`;
      bodyText = `Hello ${business.name},\n\n` +
        `Your support ticket has been updated:\n\n` +
        `Ticket ID: ${ticket.id}\n` +
        `Issue Type: ${ticket.issue_type}\n` +
        `New Status: ${ticket.status}\n\n` +
        (ticket.resolution_notes ? `Resolution Notes:\n${ticket.resolution_notes}\n\n` : "") +
        `You can view your ticket and respond at any time through your dashboard.\n\n` +
        `Thank you,\n` +
        `Tavari Support Team`;
      
      bodyHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Your Support Ticket ${statusMessage}</h2>
          <p>Hello ${business.name},</p>
          <p>Your support ticket has been updated:</p>
          <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Ticket ID:</strong> ${ticket.id}</p>
            <p><strong>Issue Type:</strong> ${ticket.issue_type}</p>
            <p><strong>New Status:</strong> ${ticket.status}</p>
          </div>
          ${ticket.resolution_notes ? `
          <div style="background-color: #eff6ff; padding: 15px; border-left: 4px solid #2563eb; margin: 20px 0;">
            <p><strong>Resolution Notes:</strong></p>
            <p style="white-space: pre-wrap;">${ticket.resolution_notes}</p>
          </div>
          ` : ""}
          <p>You can view your ticket and respond at any time through your dashboard.</p>
          <p>Thank you,<br>Tavari Support Team</p>
        </div>
      `;
    } else {
      // Generic update
      subject = `Update on Your Support Ticket #${ticketIdShort}`;
      bodyText = `Hello ${business.name},\n\n` +
        `Your support ticket has been updated:\n\n` +
        `Ticket ID: ${ticket.id}\n` +
        `Issue Type: ${ticket.issue_type}\n` +
        `Status: ${ticket.status}\n\n` +
        `You can view your ticket and respond at any time through your dashboard.\n\n` +
        `Thank you,\n` +
        `Tavari Support Team`;
      
      bodyHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Update on Your Support Ticket</h2>
          <p>Hello ${business.name},</p>
          <p>Your support ticket has been updated:</p>
          <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Ticket ID:</strong> ${ticket.id}</p>
            <p><strong>Issue Type:</strong> ${ticket.issue_type}</p>
            <p><strong>Status:</strong> ${ticket.status}</p>
          </div>
          <p>You can view your ticket and respond at any time through your dashboard.</p>
          <p>Thank you,<br>Tavari Support Team</p>
        </div>
      `;
    }

    const displayName = `Tavari Support`;
    await sendEmail(business.email, subject, bodyText, bodyHtml, displayName, business.id);
    console.log(`[Notifications] Sent ticket update notification to ${business.email} for ticket ${ticket.id}`);
  } catch (error) {
    console.error(`[Notifications] Error sending support ticket update notification:`, error);
    // Don't throw - email failures shouldn't break the ticket update
  }
}

