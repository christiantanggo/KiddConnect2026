-- Create sms_campaigns table
CREATE TABLE IF NOT EXISTS sms_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  message_text TEXT NOT NULL,
  total_recipients INTEGER NOT NULL,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed, cancelled
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_summary JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create sms_campaign_recipients table
CREATE TABLE IF NOT EXISTS sms_campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES sms_campaigns(id) ON DELETE CASCADE,
  phone_number VARCHAR(50) NOT NULL,
  email VARCHAR(255),
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  status VARCHAR(20) DEFAULT 'pending', -- pending, sent, failed
  telnyx_message_id VARCHAR(255),
  error_message TEXT,
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create sms_opt_outs table for tracking opt-outs per business
CREATE TABLE IF NOT EXISTS sms_opt_outs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  phone_number VARCHAR(50) NOT NULL,
  opted_out_at TIMESTAMP DEFAULT NOW(),
  reason VARCHAR(255), -- 'STOP', 'manual', etc.
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(business_id, phone_number)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_sms_campaigns_business_id ON sms_campaigns(business_id);
CREATE INDEX IF NOT EXISTS idx_sms_campaigns_status ON sms_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_sms_campaign_recipients_campaign_id ON sms_campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_sms_campaign_recipients_status ON sms_campaign_recipients(status);
CREATE INDEX IF NOT EXISTS idx_sms_opt_outs_business_id ON sms_opt_outs(business_id);
CREATE INDEX IF NOT EXISTS idx_sms_opt_outs_phone_number ON sms_opt_outs(phone_number);

