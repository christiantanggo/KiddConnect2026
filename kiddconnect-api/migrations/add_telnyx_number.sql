-- Add telnyx_number column to businesses table
ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS telnyx_number VARCHAR(50);

-- Add index for telnyx_number lookups
CREATE INDEX IF NOT EXISTS idx_businesses_telnyx_number ON businesses(telnyx_number) WHERE telnyx_number IS NOT NULL;

