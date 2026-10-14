-- Create invoice_settings table for company invoice information
CREATE TABLE IF NOT EXISTS invoice_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name VARCHAR(255),
  company_address TEXT,
  company_email VARCHAR(255),
  hst_number VARCHAR(50),
  tax_rate DECIMAL(5,4) DEFAULT 0.13, -- Default 13% HST (can be overridden per invoice if needed)
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default invoice settings (single row - we'll use a singleton pattern)
INSERT INTO invoice_settings (id, company_name, company_email, tax_rate)
VALUES (gen_random_uuid(), 'Tavari', 'info@tanggo.ca', 0.13)
ON CONFLICT DO NOTHING;

-- Add account_number to businesses table for invoice numbering
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS account_number VARCHAR(50);

-- Add tax fields to invoices table
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5,4) DEFAULT 0.13,
ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS subtotal DECIMAL(10,2);

-- Update existing invoices to set subtotal = amount and calculate tax_amount
UPDATE invoices
SET 
  subtotal = amount / (1 + COALESCE(tax_rate, 0.13)),
  tax_amount = amount - (amount / (1 + COALESCE(tax_rate, 0.13)))
WHERE subtotal IS NULL OR tax_amount IS NULL;

-- Create index for invoice_settings (though there should only be one row)
CREATE INDEX IF NOT EXISTS idx_invoice_settings_id ON invoice_settings(id);

-- Create index for account_number
CREATE INDEX IF NOT EXISTS idx_businesses_account_number ON businesses(account_number);

