-- Migrate vapi_phone_number to telnyx_number for businesses
-- This moves phone numbers from vapi_phone_number to telnyx_number
-- for businesses that have a VAPI number but no Telnyx number

-- Update businesses that have vapi_phone_number but no telnyx_number
UPDATE businesses
SET telnyx_number = vapi_phone_number,
    updated_at = NOW()
WHERE vapi_phone_number IS NOT NULL
  AND vapi_phone_number != ''
  AND (telnyx_number IS NULL OR telnyx_number = '')
  AND deleted_at IS NULL;

-- Show results
SELECT 
    id,
    name,
    email,
    vapi_phone_number,
    telnyx_number,
    CASE 
        WHEN telnyx_number IS NOT NULL AND telnyx_number = vapi_phone_number THEN '✅ Migrated'
        WHEN vapi_phone_number IS NOT NULL AND telnyx_number IS NULL THEN '⚠️  Not migrated (check manually)'
        WHEN telnyx_number IS NOT NULL AND telnyx_number != vapi_phone_number THEN 'ℹ️  Different numbers'
        ELSE 'ℹ️  No numbers'
    END AS migration_status
FROM businesses
WHERE deleted_at IS NULL
ORDER BY name;

