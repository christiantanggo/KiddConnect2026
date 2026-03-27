// routes/invoices.js
// Invoice management routes

import express from "express";
import { authenticate } from "../middleware/auth.js";
import { getInvoicesByBusiness, getInvoiceById, getInvoicePDF } from "../services/invoices.js";

const router = express.Router();

// Get all invoices for business
router.get("/", authenticate, async (req, res) => {
  try {
    const invoices = await getInvoicesByBusiness(req.businessId);
    res.json({ invoices });
  } catch (error) {
    console.error("Get invoices error:", error);
    console.error("Error details:", {
      message: error.message,
      stack: error.stack,
      businessId: req.businessId,
    });
    res.status(500).json({ 
      error: "Failed to get invoices",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get invoice by ID
router.get("/:id", authenticate, async (req, res) => {
  try {
    const invoice = await getInvoiceById(req.params.id);
    
    // Verify invoice belongs to business
    if (invoice.business_id !== req.businessId) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    res.json({ invoice });
  } catch (error) {
    console.error("Get invoice error:", error);
    res.status(500).json({ error: "Failed to get invoice" });
  }
});

// Download invoice PDF
router.get("/:id/pdf", authenticate, async (req, res) => {
  try {
    const invoice = await getInvoiceById(req.params.id);
    
    // Verify invoice belongs to business
    if (invoice.business_id !== req.businessId) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    const pdfBuffer = await getInvoicePDF(req.params.id);
    
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="invoice-${invoice.invoice_number}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Get invoice PDF error:", error);
    res.status(500).json({ error: "Failed to get invoice PDF" });
  }
});

export default router;

