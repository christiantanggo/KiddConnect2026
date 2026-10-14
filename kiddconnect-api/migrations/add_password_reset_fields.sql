-- Add password reset fields to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(255),
ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMP;

-- Add index for faster token lookups
CREATE INDEX IF NOT EXISTS idx_users_password_reset_token ON users(password_reset_token) 
WHERE password_reset_token IS NOT NULL;

-- Add comment
COMMENT ON COLUMN users.password_reset_token IS 'Code for password reset (6-digit numeric code)';
COMMENT ON COLUMN users.password_reset_expires IS 'Expiration timestamp for password reset code (15 minutes)';

