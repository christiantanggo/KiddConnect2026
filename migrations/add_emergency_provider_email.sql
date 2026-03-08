-- Add optional email to emergency_providers for "press 4 to email details"
ALTER TABLE emergency_providers
  ADD COLUMN IF NOT EXISTS email VARCHAR(255) NULL;

COMMENT ON COLUMN emergency_providers.email IS 'Optional; used when provider presses 4 to receive request details by email.';
