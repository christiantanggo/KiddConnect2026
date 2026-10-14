// supabase/functions/mail-send/index.ts
// AWS SES Email Integration via Supabase Edge Function

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  SESv2Client,
  SendEmailCommand
} from "npm:@aws-sdk/client-sesv2@3.654.0";
import {
  SESClient,
  SendRawEmailCommand
} from "npm:@aws-sdk/client-ses@3.654.0";

const AWS_REGION = Deno.env.get("AWS_REGION") || "us-east-1";
const SES_ACCESS_KEY_ID = Deno.env.get("SES_ACCESS_KEY_ID");
const SES_SECRET_ACCESS_KEY = Deno.env.get("SES_SECRET_ACCESS_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Initialize SES clients
const ses = new SESv2Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: SES_ACCESS_KEY_ID!,
    secretAccessKey: SES_SECRET_ACCESS_KEY!
  }
});

// For attachments (Raw email)
const sesV1 = new SESClient({
  region: AWS_REGION,
  credentials: {
    accessKeyId: SES_ACCESS_KEY_ID!,
    secretAccessKey: SES_SECRET_ACCESS_KEY!
  }
});

interface SendPayload {
  businessId: string;
  campaignId: string;
  contactId: string;
  to: string;
  cc?: string;
  fromEmail: string;
  fromName?: string;
  subject: string;
  html: string;
  text?: string;
  configurationSet?: string;
  attachments?: Attachment[];
}

interface Attachment {
  filename: string;
  content: string; // Base64 encoded
  contentType: string;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
      },
    });
  }

  try {
    const payload: SendPayload = await req.json();

    // Validate required fields
    if (!payload.to || !payload.fromEmail || !payload.subject || !payload.html) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, fromEmail, subject, html" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check if email is unsubscribed or suppressed
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const supabaseUrl = `${SUPABASE_URL}/rest/v1/rpc`;
      
      // Check unsubscribed
      try {
        const unsubCheck = await fetch(`${supabaseUrl}/is_email_unsubscribed`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ email_address: payload.to }),
        });
        
        if (unsubCheck.ok) {
          const unsubResult = await unsubCheck.json();
          if (unsubResult === true) {
            return new Response(
              JSON.stringify({ error: "Email is unsubscribed" }),
              { status: 403, headers: { "Content-Type": "application/json" } }
            );
          }
        }
      } catch (e) {
        // If RPC doesn't exist, continue
        console.warn("Could not check unsubscribed status:", e);
      }

      // Check suppressed
      try {
        const suppCheck = await fetch(`${supabaseUrl}/is_email_suppressed`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ email_address: payload.to }),
        });
        
        if (suppCheck.ok) {
          const suppResult = await suppCheck.json();
          if (suppResult === true) {
            return new Response(
              JSON.stringify({ error: "Email is suppressed" }),
              { status: 403, headers: { "Content-Type": "application/json" } }
            );
          }
        }
      } catch (e) {
        // If RPC doesn't exist, continue
        console.warn("Could not check suppressed status:", e);
      }
    }

    let result;

    // If attachments exist, use Raw Email (SES v1)
    if (payload.attachments && payload.attachments.length > 0) {
      // Build raw MIME message
      const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
      let rawMessage = `From: ${payload.fromName ? `"${payload.fromName}" ` : ""}<${payload.fromEmail}>\r\n`;
      rawMessage += `To: ${payload.to}\r\n`;
      if (payload.cc) {
        rawMessage += `Cc: ${payload.cc}\r\n`;
      }
      rawMessage += `Subject: ${payload.subject}\r\n`;
      rawMessage += `MIME-Version: 1.0\r\n`;
      rawMessage += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n`;
      rawMessage += `\r\n`;

      // Add text/plain part
      rawMessage += `--${boundary}\r\n`;
      rawMessage += `Content-Type: text/plain; charset=UTF-8\r\n`;
      rawMessage += `Content-Transfer-Encoding: 7bit\r\n`;
      rawMessage += `\r\n`;
      rawMessage += payload.text || payload.html.replace(/<[^>]*>/g, "");
      rawMessage += `\r\n\r\n`;

      // Add text/html part
      rawMessage += `--${boundary}\r\n`;
      rawMessage += `Content-Type: text/html; charset=UTF-8\r\n`;
      rawMessage += `Content-Transfer-Encoding: 7bit\r\n`;
      rawMessage += `\r\n`;
      rawMessage += payload.html;
      rawMessage += `\r\n\r\n`;

      // Add attachments (base64 encoded)
      for (const attachment of payload.attachments) {
        rawMessage += `--${boundary}\r\n`;
        rawMessage += `Content-Type: ${attachment.contentType}; name="${attachment.filename}"\r\n`;
        rawMessage += `Content-Disposition: attachment; filename="${attachment.filename}"\r\n`;
        rawMessage += `Content-Transfer-Encoding: base64\r\n`;
        rawMessage += `\r\n`;
        
        // Base64 content chunked at 76 chars per line (RFC 2045)
        let chunkedBase64 = '';
        for (let i = 0; i < attachment.content.length; i += 76) {
          if (i > 0) chunkedBase64 += '\r\n';
          chunkedBase64 += attachment.content.substring(i, Math.min(i + 76, attachment.content.length));
        }
        rawMessage += chunkedBase64;
        rawMessage += `\r\n`;
      }

      // Close boundary
      rawMessage += `--${boundary}--\r\n`;

      // Send via SES v1
      const rawEmailCmd = new SendRawEmailCommand({
        RawMessage: {
          Data: new TextEncoder().encode(rawMessage) // Must be Uint8Array
        },
        ...(payload.configurationSet ? { ConfigurationSetName: payload.configurationSet } : {})
      });

      result = await sesV1.send(rawEmailCmd);
    } else {
      // Simple email (no attachments) - use SES v2
      const ccAddresses = payload.cc ? payload.cc.split(',').map(email => email.trim()) : [];
      
      const sendCmd = new SendEmailCommand({
        Destination: { 
          ToAddresses: [payload.to],
          ...(ccAddresses.length > 0 ? { CcAddresses: ccAddresses } : {})
        },
        FromEmailAddress: payload.fromName 
          ? `"${payload.fromName}" <${payload.fromEmail}>`
          : payload.fromEmail,
        Content: {
          Simple: {
            Subject: { Data: payload.subject },
            Body: {
              Html: { Data: payload.html },
              ...(payload.text ? { Text: { Data: payload.text } } : {})
            }
          }
        },
        ...(payload.configurationSet ? { ConfigurationSetName: payload.configurationSet } : {})
      });

      result = await ses.send(sendCmd);
    }

    // Log to database if Supabase is configured
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/mail_campaign_sends`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "Prefer": "return=minimal",
          },
          body: JSON.stringify({
            business_id: payload.businessId,
            campaign_id: payload.campaignId,
            contact_id: payload.contactId,
            to_email: payload.to,
            from_email: payload.fromEmail,
            subject: payload.subject,
            message_id: result.MessageId,
            sent_at: new Date().toISOString(),
          }),
        });
      } catch (logError) {
        // Don't fail if logging fails
        console.warn("Could not log to database:", logError);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageId: result.MessageId 
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("Error sending email:", error);
    
    // Log error to database if Supabase is configured
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/mail_error_logs`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "Prefer": "return=minimal",
          },
          body: JSON.stringify({
            error_message: error.message,
            error_stack: error.stack,
            occurred_at: new Date().toISOString(),
          }),
        });
      } catch (logError) {
        // Ignore logging errors
      }
    }

    return new Response(
      JSON.stringify({ 
        error: error.message || "Failed to send email" 
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});

