-- Add terms and privacy acceptance tracking fields to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS terms_version VARCHAR(50),
ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS terms_accepted_ip VARCHAR(45);

-- Create index for terms version tracking
CREATE INDEX IF NOT EXISTS idx_users_terms_version ON users(terms_version);

-- Add comment for documentation
COMMENT ON COLUMN users.terms_accepted_at IS 'Timestamp when user accepted Terms of Service';
COMMENT ON COLUMN users.terms_version IS 'Version of Terms of Service user accepted (e.g., "2025-12-27")';
COMMENT ON COLUMN users.privacy_accepted_at IS 'Timestamp when user accepted Privacy Policy';
COMMENT ON COLUMN users.terms_accepted_ip IS 'IP address from which terms were accepted (for compliance)';

