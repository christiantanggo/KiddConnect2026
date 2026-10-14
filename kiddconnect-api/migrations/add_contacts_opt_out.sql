-- Add opted_out columns to contacts table
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS opted_out BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS opted_out_at TIMESTAMP;

-- Create index for opted_out status
CREATE INDEX IF NOT EXISTS idx_contacts_opted_out ON contacts(business_id, opted_out) WHERE opted_out = TRUE;

