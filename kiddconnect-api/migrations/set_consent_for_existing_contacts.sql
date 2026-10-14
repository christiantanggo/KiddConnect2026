-- Set SMS consent for existing contacts that don't have it
-- This is a one-time migration to set consent for contacts created before consent tracking was implemented
-- 
-- IMPORTANT: Only run this if you have proof that these contacts provided consent
-- (e.g., they filled out a waiver, checked a box, etc.)
-- 
-- For contacts without explicit consent proof, you should NOT set this to true
-- Instead, you need to obtain consent from them before sending SMS

-- Option 1: Set consent for ALL existing contacts (USE WITH CAUTION)
-- Only use this if you have documented proof that all contacts consented
-- UPDATE contacts
-- SET sms_consent = TRUE,
--     sms_consent_timestamp = created_at, -- Use creation date as consent timestamp
--     sms_consent_method = 'migration_legacy_contact',
--     sms_consent_source = 'Legacy contact - consent assumed from existing relationship'
-- WHERE sms_consent IS NULL OR sms_consent = FALSE;

-- Option 2: Set consent ONLY for contacts created via CSV upload (safer)
-- This assumes CSV uploads required consent checkbox
-- UPDATE contacts
-- SET sms_consent = TRUE,
--     sms_consent_timestamp = created_at,
--     sms_consent_method = 'csv_upload',
--     sms_consent_source = 'CSV Upload - consent provided via checkbox'
-- WHERE (sms_consent IS NULL OR sms_consent = FALSE)
--   AND created_at >= '2024-01-01' -- Adjust date to when CSV uploads started requiring consent
--   AND phone_number IS NOT NULL;

-- Option 3: Manual review (RECOMMENDED)
-- Review each contact and set consent individually based on your records
-- Example:
-- UPDATE contacts
-- SET sms_consent = TRUE,
--     sms_consent_timestamp = '2024-01-15 10:00:00', -- Actual consent date
--     sms_consent_method = 'waiver_checkbox',
--     sms_consent_source = 'Facility Waiver - Checkbox checked'
-- WHERE id = 'contact-uuid-here';

-- Check how many contacts need consent
SELECT 
  COUNT(*) as total_contacts,
  COUNT(*) FILTER (WHERE sms_consent = TRUE) as has_consent,
  COUNT(*) FILTER (WHERE sms_consent IS NULL OR sms_consent = FALSE) as needs_consent,
  COUNT(*) FILTER (WHERE phone_number IS NOT NULL AND (sms_consent IS NULL OR sms_consent = FALSE)) as needs_consent_with_phone
FROM contacts;

