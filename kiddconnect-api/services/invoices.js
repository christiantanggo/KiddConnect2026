// services/invoices.js
// Invoice generation (PDF), storage, and email delivery

import PDFDocument from "pdfkit";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { supabaseClient } from "../config/database.js";
import { Business } from "../models/Business.js";
import { sendInvoiceEmail } from "./notifications.js";
import { formatPhoneNumber } from "../utils/phoneFormatter.js";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
});

const S3_BUCKET = process.env.AWS_S3_BUCKET;

/**
 * Generate invoice number in format: {account_number}-{MMDDYYYY}-{sequential}
 * Example: 123456789-12272025 or 123456789-12272025-3 (if multiple invoices same day)
 */
export async function generateInvoiceNumber(businessId) {
  const business = await Business.findById(businessId);
  if (!business) {
    throw new Error('Business not found');
  }
  
  if (!business.account_number) {
    throw new Error('Business account_number is required for invoice generation');
  }
  
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const year = now.getFullYear();
  const dateStr = `${month}${day}${year}`;
  
  // Count how many invoices exist for this business on this date
  const dateStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateEnd = new Date(dateStart);
  dateEnd.setDate(dateEnd.getDate() + 1);
  
  const { count } = await supabaseClient
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .gte('created_at', dateStart.toISOString())
    .lt('created_at', dateEnd.toISOString());
  
  const sequentialNumber = (count || 0) + 1;
  
  // If it's the first invoice of the day, don't include sequential number
  if (sequentialNumber === 1) {
    return `${business.account_number}-${dateStr}`;
  } else {
    return `${business.account_number}-${dateStr}-${sequentialNumber}`;
  }
}

/**
 * Generate PDF invoice
 */
async function generatePDFInvoice(invoice, business) {
  // Get invoice settings for company info
  const { InvoiceSettings } = await import('../models/InvoiceSettings.js');
  const invoiceSettings = await InvoiceSettings.get();
  
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Header - use company name from invoice settings
    const companyName = invoiceSettings?.company_name || "Tavari";
    doc.fontSize(20).text(companyName, 50, 50);
    doc.fontSize(12).text("AI Phone Receptionist", 50, 75);
    
    // Company address and info (if available)
    let headerY = 100;
    if (invoiceSettings?.company_address) {
      doc.fontSize(10).text(invoiceSettings.company_address, 50, headerY);
      const addressLines = invoiceSettings.company_address.split('\n');
      headerY += addressLines.length * 15;
    }
    if (invoiceSettings?.hst_number) {
      doc.fontSize(10).text(`HST Number: ${invoiceSettings.hst_number}`, 50, headerY);
      headerY += 15;
    }
    if (invoiceSettings?.company_email) {
      doc.fontSize(10).text(invoiceSettings.company_email, 50, headerY);
    }
    doc.moveDown();

    // Invoice details
    doc.fontSize(16).text(`Invoice #${invoice.invoice_number}`, 50, 180);
    doc.fontSize(10).text(`Date: ${new Date(invoice.created_at).toLocaleDateString()}`, 50, 205);

    // Business info (Bill To)
    doc.fontSize(12).text("Bill To:", 350, 180);
    doc.fontSize(10).text(business.name, 350, 200);
    let billToY = 215;
    if (business.address) {
      doc.text(business.address, 350, billToY);
      const addressLines = business.address.split('\n');
      billToY += addressLines.length * 15;
    }
    if (business.phone) {
      doc.text(formatPhoneNumber(business.phone) || business.phone, 350, billToY);
      billToY += 15;
    }
    doc.text(business.email, 350, billToY);

    doc.moveDown(3);

    // Invoice items
    let y = 290;
    doc.fontSize(12).text("Description", 50, y);
    doc.text("Amount", 450, y);
    doc.moveTo(50, y + 15).lineTo(550, y + 15).stroke();
    y += 30;

    // Subtotal
    const subtotal = invoice.subtotal || invoice.amount;
    doc.fontSize(10).text(invoice.invoice_type, 50, y);
    doc.text(`$${subtotal.toFixed(2)}`, 450, y);
    y += 20;

    if (invoice.prorated_amount) {
      doc.text(`Prorated (${invoice.prorated_days} days)`, 50, y);
      doc.text(`$${invoice.prorated_amount.toFixed(2)}`, 450, y);
      y += 20;
    }

    if (invoice.period_start && invoice.period_end) {
      doc.text(`Period: ${new Date(invoice.period_start).toLocaleDateString()} - ${new Date(invoice.period_end).toLocaleDateString()}`, 50, y);
      y += 25;
    } else {
      y += 5;
    }

    // Tax line (if tax exists)
    if (invoice.tax_amount && invoice.tax_amount > 0) {
      doc.moveTo(50, y).lineTo(550, y).stroke();
      y += 15;
      const taxRatePercent = ((invoice.tax_rate || 0) * 100).toFixed(2);
      doc.fontSize(10).text(`Tax (${taxRatePercent}%)`, 50, y);
      doc.text(`$${invoice.tax_amount.toFixed(2)}`, 450, y);
      y += 20;
    }

    // Total line
    doc.moveTo(50, y).lineTo(550, y).stroke();
    y += 15;

    // Total
    doc.fontSize(12).text("Total", 50, y);
    doc.fontSize(12).text(`$${invoice.amount.toFixed(2)}`, 450, y);

    // Footer
    y = 700;
    doc.fontSize(8).text("Thank you for your business!", 50, y);
    const supportEmail = invoiceSettings?.company_email || "info@tanggo.ca";
    doc.text(`Questions? Contact ${supportEmail}`, 50, y + 15);

    doc.end();
  });
}

/**
 * Store PDF in S3
 */
async function storePDFInS3(pdfBuffer, invoiceNumber) {
  if (!S3_BUCKET) {
    // Local storage fallback
    return null;
  }

  try {
    const key = `invoices/${invoiceNumber}.pdf`;
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: pdfBuffer,
      ContentType: "application/pdf",
    });

    await s3Client.send(command);
    const url = `https://${S3_BUCKET}.s3.${process.env.AWS_REGION || "us-east-1"}.amazonaws.com/${key}`;
    return { url, path: key };
  } catch (error) {
    console.error("Error storing PDF in S3:", error);
    return null;
  }
}

/**
 * Generate and store invoice
 */
export async function generateInvoice(businessId, invoiceData) {
  const business = await Business.findById(businessId);
  if (!business) {
    throw new Error("Business not found");
  }

  const invoiceNumber = await generateInvoiceNumber(businessId);
  
  // Get invoice settings for tax rate
  const { InvoiceSettings } = await import('../models/InvoiceSettings.js');
  const invoiceSettings = await InvoiceSettings.get();
  const taxRate = invoiceData.tax_rate !== undefined ? invoiceData.tax_rate : (invoiceSettings?.tax_rate || 0.13);
  
  // Calculate subtotal and tax
  const subtotal = parseFloat(invoiceData.subtotal || invoiceData.amount);
  const taxAmount = subtotal * taxRate;
  const totalAmount = subtotal + taxAmount;

  const invoice = {
    business_id: businessId,
    invoice_number: invoiceNumber,
    subtotal: subtotal,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    amount: totalAmount, // Total amount including tax
    currency: invoiceData.currency || "CAD",
    invoice_type: invoiceData.invoice_type,
    period_start: invoiceData.period_start || null,
    period_end: invoiceData.period_end || null,
    prorated_amount: invoiceData.prorated_amount ? parseFloat(invoiceData.prorated_amount) : null,
    prorated_days: invoiceData.prorated_days || null,
    status: "paid",
    paid_at: new Date().toISOString(),
  };

  // Generate PDF
  const pdfBuffer = await generatePDFInvoice(invoice, business);

  // Store PDF
  const storageInfo = await storePDFInS3(pdfBuffer, invoiceNumber);
  if (storageInfo) {
    invoice.pdf_url = storageInfo.url;
    invoice.pdf_storage_path = storageInfo.path;
  }

  // Store invoice in database
  const { data: savedInvoice, error } = await supabaseClient
    .from("invoices")
    .insert(invoice)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save invoice: ${error.message}`);
  }

  // Send invoice email
  try {
    await sendInvoiceEmail(business, savedInvoice, pdfBuffer);
  } catch (error) {
    console.error("Error sending invoice email:", error);
    // Don't fail if email fails
  }

  return savedInvoice;
}

/**
 * Get invoice by ID
 */
export async function getInvoiceById(invoiceId) {
  const { data, error } = await supabaseClient
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .single();

  if (error) {
    throw new Error(`Invoice not found: ${error.message}`);
  }

  return data;
}

/**
 * Get invoices for business
 */
export async function getInvoicesByBusiness(businessId, limit = 50) {
  try {
    const { data, error } = await supabaseClient
      .from("invoices")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      // If table doesn't exist, return empty array instead of throwing
      if (error.code === 'PGRST205' || error.message.includes('does not exist')) {
        console.warn(`[Invoices] Table 'invoices' does not exist, returning empty array`);
        return [];
      }
      throw new Error(`Failed to get invoices: ${error.message}`);
    }

    return data || [];
  } catch (error) {
    // If it's a table not found error, return empty array
    if (error.message && error.message.includes('does not exist')) {
      console.warn(`[Invoices] Table not found, returning empty array`);
      return [];
    }
    throw error;
  }
}

/**
 * Get PDF from S3 or generate on-demand
 */
export async function getInvoicePDF(invoiceId) {
  const invoice = await getInvoiceById(invoiceId);
  const business = await Business.findById(invoice.business_id);

  if (invoice.pdf_url) {
    // Return S3 URL or fetch PDF
    // For now, regenerate if needed
  }

  // Regenerate PDF
  const pdfBuffer = await generatePDFInvoice(invoice, business);
  return pdfBuffer;
}

