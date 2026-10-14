-- Create demo_emails table for tracking demo signups and sending follow-up emails
CREATE TABLE IF NOT EXISTS demo_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  assistant_id VARCHAR(255),
  business_name VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  marketing_consent BOOLEAN DEFAULT FALSE,
  follow_up_sent BOOLEAN DEFAULT FALSE,
  signed_up BOOLEAN DEFAULT FALSE,
  signed_up_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on email for fast lookups
CREATE INDEX IF NOT EXISTS idx_demo_emails_email ON demo_emails(email);

-- Create index on created_at for 24-hour follow-up queries
CREATE INDEX IF NOT EXISTS idx_demo_emails_created_at ON demo_emails(created_at);

-- Create index on follow_up_sent and signed_up for querying pending follow-ups
CREATE INDEX IF NOT EXISTS idx_demo_emails_follow_up ON demo_emails(follow_up_sent, signed_up, created_at);

-- Add comment
COMMENT ON TABLE demo_emails IS 'Tracks demo emails for 24-hour follow-up marketing emails';

