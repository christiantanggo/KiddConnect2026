-- Create business_phone_numbers table for multiple phone numbers per business
-- This allows a business to have multiple Telnyx numbers for SMS sending

CREATE TABLE IF NOT EXISTS business_phone_numbers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    phone_number VARCHAR(50) NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(business_id, phone_number)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_business_phone_numbers_business_id ON business_phone_numbers(business_id);
CREATE INDEX IF NOT EXISTS idx_business_phone_numbers_phone_number ON business_phone_numbers(phone_number);
CREATE INDEX IF NOT EXISTS idx_business_phone_numbers_active ON business_phone_numbers(business_id, is_active) WHERE is_active = TRUE;

-- Migrate existing telnyx_number values to the new table
INSERT INTO business_phone_numbers (business_id, phone_number, is_primary, is_active)
SELECT 
    id,
    telnyx_number,
    TRUE,
    TRUE
FROM businesses
WHERE telnyx_number IS NOT NULL 
  AND telnyx_number != ''
  AND deleted_at IS NULL
ON CONFLICT (business_id, phone_number) DO NOTHING;

-- Show migration results
SELECT 
    b.id,
    b.name,
    b.telnyx_number AS old_telnyx_number,
    COUNT(bpn.id) AS number_count,
    STRING_AGG(bpn.phone_number, ', ') AS phone_numbers
FROM businesses b
LEFT JOIN business_phone_numbers bpn ON b.id = bpn.business_id
WHERE b.deleted_at IS NULL
GROUP BY b.id, b.name, b.telnyx_number
ORDER BY b.name;

