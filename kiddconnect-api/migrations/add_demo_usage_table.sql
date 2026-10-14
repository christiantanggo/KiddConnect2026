-- Create demo_usage table for tracking demo call usage
-- This tracks minutes used for demo calls to monitor VAPI costs

CREATE TABLE IF NOT EXISTS demo_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id VARCHAR(255) NOT NULL,
  call_id VARCHAR(255),
  business_name VARCHAR(255),
  email VARCHAR(255),
  duration_seconds INTEGER NOT NULL,
  minutes_used DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  date DATE NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL
);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_demo_usage_date ON demo_usage(date);
CREATE INDEX IF NOT EXISTS idx_demo_usage_month_year ON demo_usage(year, month);
CREATE INDEX IF NOT EXISTS idx_demo_usage_created_at ON demo_usage(created_at);
CREATE INDEX IF NOT EXISTS idx_demo_usage_assistant_id ON demo_usage(assistant_id);

-- Add comment
COMMENT ON TABLE demo_usage IS 'Tracks demo call usage (minutes/duration) for monitoring VAPI costs';

