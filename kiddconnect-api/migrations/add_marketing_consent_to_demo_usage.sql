-- Add marketing_consent column to demo_usage table
-- This tracks whether demo users consented to receive marketing materials

ALTER TABLE demo_usage 
ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN DEFAULT false;

-- Create index for efficient queries on marketing consent
CREATE INDEX IF NOT EXISTS idx_demo_usage_marketing_consent ON demo_usage(marketing_consent) WHERE marketing_consent = true;

COMMENT ON COLUMN demo_usage.marketing_consent IS 'Whether the user consented to receive marketing materials';

