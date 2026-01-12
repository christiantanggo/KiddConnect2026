// services/emailTemplates.js
// Email template rendering service using Handlebars

import Handlebars from "handlebars";
import { supabaseClient } from "../config/database.js";

// Register Handlebars helpers
Handlebars.registerHelper("if", function(conditional, options) {
  if (conditional) {
    return options.fn(this);
  } else {
    return options.inverse(this);
  }
});

Handlebars.registerHelper("eq", function(a, b) {
  return a === b;
});

/**
 * Load email template from database
 */
async function loadTemplate(templateKey) {
  const { data, error } = await supabaseClient
    .from("email_templates")
    .select("*")
    .eq("template_key", templateKey)
    .eq("is_active", true)
    .single();

  if (error) {
    throw new Error(`Template not found: ${templateKey}`);
  }

  return data;
}

/**
 * Render email template with variables
 */
export async function renderEmailTemplate(templateKey, variables = {}) {
  try {
    const template = await loadTemplate(templateKey);

    // Compile templates
    const subjectTemplate = Handlebars.compile(template.subject);
    const bodyTextTemplate = Handlebars.compile(template.body_text);
    const bodyHtmlTemplate = template.body_html
      ? Handlebars.compile(template.body_html)
      : null;

    // Render templates
    const subject = subjectTemplate(variables);
    const bodyText = bodyTextTemplate(variables);
    const bodyHtml = bodyHtmlTemplate ? bodyHtmlTemplate(variables) : null;

    return {
      subject,
      bodyText,
      bodyHtml,
    };
  } catch (error) {
    console.error(`[EmailTemplates] Error rendering template ${templateKey}:`, error);
    throw error;
  }
}
















