import dotenv from 'dotenv';
dotenv.config();

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set!');
  process.exit(1);
}

console.log('✅ Using Supabase client');
console.log('⚠️  Supabase migrations need to be run via SQL Editor');
console.log('📝 Please run the following SQL in your Supabase SQL Editor:');
console.log('');
console.log('-- Copy and paste this into Supabase Dashboard → SQL Editor → New Query');
console.log('');

const migrationSQL = `
-- Add VAPI-specific columns to existing businesses table
ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS vapi_assistant_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS vapi_phone_number VARCHAR(50),
ADD COLUMN IF NOT EXISTS public_phone_number VARCHAR(50),
ADD COLUMN IF NOT EXISTS call_forward_rings INTEGER DEFAULT 4,
ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS after_hours_behavior VARCHAR(50) DEFAULT 'take_message',
ADD COLUMN IF NOT EXISTS sms_notification_number VARCHAR(50),
ADD COLUMN IF NOT EXISTS sms_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS email_ai_answered BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS email_missed_calls BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS call_recordings_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS custom_pricing_monthly DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS custom_pricing_overage DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS bonus_minutes INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS faq_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS billing_day INTEGER,
ADD COLUMN IF NOT EXISTS next_billing_date DATE,
ADD COLUMN IF NOT EXISTS overage_billing_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS overage_cap_minutes INTEGER,
ADD COLUMN IF NOT EXISTS minutes_exhausted_behavior VARCHAR(20) DEFAULT 'disable_ai',
ADD COLUMN IF NOT EXISTS notify_minutes_almost_used BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS notify_minutes_fully_used BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS notify_overage_charges BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS usage_threshold_percent INTEGER DEFAULT 80,
ADD COLUMN IF NOT EXISTS allow_call_transfer BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS cancellation_requested_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS cancellation_effective_date DATE,
ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS data_export_requested_at TIMESTAMP;

-- Create admin_users table for Tavari staff
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  role VARCHAR(50) DEFAULT 'support',
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create admin_activity_log for tracking staff actions
CREATE TABLE IF NOT EXISTS admin_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID REFERENCES admin_users(id),
  business_id UUID REFERENCES businesses(id),
  action VARCHAR(255) NOT NULL,
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  stripe_invoice_id VARCHAR(255),
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  invoice_type VARCHAR(50) NOT NULL,
  period_start DATE,
  period_end DATE,
  prorated_amount DECIMAL(10,2),
  prorated_days INTEGER,
  pdf_url TEXT,
  pdf_storage_path TEXT,
  status VARCHAR(20) DEFAULT 'paid',
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create email_templates table
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key VARCHAR(100) UNIQUE NOT NULL,
  template_name VARCHAR(255) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  body_text TEXT NOT NULL,
  body_html TEXT,
  description TEXT,
  variables JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create support_tickets table
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  issue_type VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  urgency VARCHAR(20) DEFAULT 'normal',
  status VARCHAR(20) DEFAULT 'open',
  resolution_notes TEXT,
  resolved_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Update call_sessions for VAPI (keep existing columns, add VAPI columns)
ALTER TABLE call_sessions
ADD COLUMN IF NOT EXISTS vapi_call_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS transfer_attempted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS transfer_successful BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS transfer_timestamp TIMESTAMP;

-- Make voximplant_call_id nullable since VAPI uses different ID
ALTER TABLE call_sessions
ALTER COLUMN voximplant_call_id DROP NOT NULL;

-- Update usage_minutes table to track billing cycle
ALTER TABLE usage_minutes
ADD COLUMN IF NOT EXISTS billing_cycle_start DATE,
ADD COLUMN IF NOT EXISTS billing_cycle_end DATE;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
CREATE INDEX IF NOT EXISTS idx_admin_activity_log_admin_user_id ON admin_activity_log(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_activity_log_business_id ON admin_activity_log(business_id);
CREATE INDEX IF NOT EXISTS idx_invoices_business_id ON invoices(business_id);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at);
CREATE INDEX IF NOT EXISTS idx_invoices_stripe_invoice_id ON invoices(stripe_invoice_id);
CREATE INDEX IF NOT EXISTS idx_email_templates_template_key ON email_templates(template_key);
CREATE INDEX IF NOT EXISTS idx_support_tickets_business_id ON support_tickets(business_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON support_tickets(created_at);
CREATE INDEX IF NOT EXISTS idx_call_sessions_vapi_call_id ON call_sessions(vapi_call_id);

-- Insert default email templates
INSERT INTO email_templates (template_key, template_name, subject, body_text, description, variables) VALUES
('call_summary', 'Call Summary', 'Call Summary from {{business_name}}', 'A call was received:\n\nCaller: {{caller_name}}\nPhone: {{caller_phone}}\nTime: {{call_time}}\n\nSummary: {{call_summary}}\n\n{{#if message}}Message: {{message}}{{/if}}', 'Sent when AI answers a call', '{"business_name": "Business name", "caller_name": "Caller name", "caller_phone": "Caller phone", "call_time": "Call timestamp", "call_summary": "AI-generated summary", "message": "Message taken (optional)"}'),
('minutes_almost_used', 'Minutes Almost Used', 'You''ve used {{usage_percent}}% of your monthly minutes', 'You''ve used {{minutes_used}} of {{minutes_total}} monthly minutes ({{usage_percent}}% used).\n\nYou have {{minutes_remaining}} minutes remaining this billing cycle.\n\nMinutes reset on: {{reset_date}}', 'Sent when usage reaches threshold (e.g., 80%)', '{"minutes_used": "Minutes used", "minutes_total": "Total minutes", "usage_percent": "Usage percentage", "minutes_remaining": "Minutes remaining", "reset_date": "Billing cycle reset date"}'),
('minutes_fully_used', 'Minutes Fully Used', 'All monthly minutes used', 'You''ve used all {{minutes_total}} of your monthly minutes.\n\n{{#if option_a}}Your AI phone agent has been paused until your next billing date ({{reset_date}}). Calls will be forwarded directly to your restaurant.{{/if}}\n\n{{#if option_b}}Overage billing is now active. You''ll be charged at your plan''s overage rate until your monthly cap is reached.{{/if}}', 'Sent when minutes reach zero', '{"minutes_total": "Total minutes", "option_a": "Option A behavior", "option_b": "Option B behavior", "reset_date": "Billing cycle reset date"}'),
('overage_charges', 'Overage Charges Applied', 'Additional charges applied to your account', 'You''ve been charged for {{overage_minutes}} overage minutes at ${{overage_rate}} per minute.\n\nTotal overage charge: ${{overage_amount}}\nOverage minutes used: {{overage_minutes}} of {{overage_cap}}\n\nAn invoice has been generated and emailed to you.', 'Sent when overage charges are applied', '{"overage_minutes": "Overage minutes", "overage_rate": "Overage rate per minute", "overage_amount": "Total overage charge", "overage_cap": "Overage cap"}'),
('ai_disabled_manual', 'AI Disabled - Manual', 'AI Phone Agent Disabled', 'Your AI phone agent has been turned off.\n\nCalls will be forwarded directly to your restaurant.\n\nYou can re-enable it anytime from your dashboard settings.', 'Sent when user manually disables AI', '{"business_name": "Business name"}'),
('ai_disabled_minutes', 'AI Disabled - Minutes Exhausted', 'AI Phone Agent Paused - Minutes Exhausted', 'Your AI phone agent has been automatically paused.\n\nYou''ve used all {{minutes_total}} of your monthly minutes.\n\nAI will automatically resume on your next billing date: {{reset_date}}\n\nMinutes reset on: {{reset_date}}\n\nCalls will be forwarded directly to your restaurant until then.', 'Sent when AI disabled due to minutes exhausted (Option A)', '{"minutes_total": "Total minutes", "reset_date": "Billing cycle reset date"}'),
('ai_disabled_overage_cap', 'AI Disabled - Overage Cap Reached', 'AI Phone Agent Paused - Overage Cap Reached', 'Your AI phone agent has been automatically paused.\n\nYou''ve reached your monthly overage cap of {{overage_cap}} minutes.\n\nAI will automatically resume on your next billing date: {{reset_date}}\n\nCalls will be forwarded directly to your restaurant until then.', 'Sent when AI disabled due to overage cap reached', '{"overage_cap": "Overage cap minutes", "reset_date": "Billing cycle reset date"}'),
('ai_disabled_payment', 'AI Disabled - Payment Issue', 'AI Phone Agent Disabled - Payment Issue', 'Your AI phone agent has been disabled due to a payment issue.\n\nPlease update your payment method to resume service.', 'Sent when AI disabled due to payment issue', '{"business_name": "Business name"}'),
('ai_resumed', 'AI Resumed', 'AI Phone Agent Resumed', 'Your monthly minutes have been reset.\n\nYour AI phone agent is now active.\n\nYou have {{minutes_total}} minutes available this billing cycle.\n\nMinutes reset on: {{reset_date}}', 'Sent when AI resumes on billing cycle reset', '{"minutes_total": "Total minutes", "reset_date": "Billing cycle reset date"}'),
('invoice', 'Invoice', 'Invoice #{{invoice_number}} from Tavari', 'Invoice #{{invoice_number}}\n\nAmount: ${{amount}}\nType: {{invoice_type}}\nPeriod: {{period_start}} to {{period_end}}\n\n{{#if prorated_amount}}Prorated amount: ${{prorated_amount}} ({{prorated_days}} days){{/if}}\n\nThank you for your business!', 'Invoice email with PDF attachment', '{"invoice_number": "Invoice number", "amount": "Invoice amount", "invoice_type": "Invoice type", "period_start": "Period start", "period_end": "Period end", "prorated_amount": "Prorated amount (optional)", "prorated_days": "Prorated days (optional)"}'),
('support_ticket_created', 'Support Ticket Created', 'Support Ticket #{{ticket_id}} Received', 'A new support ticket has been received:\n\nBusiness: {{business_name}}\nIssue Type: {{issue_type}}\nDescription: {{description}}\nUrgency: {{urgency}}\n\nTicket ID: {{ticket_id}}', 'Sent to Tavari support when ticket is created', '{"ticket_id": "Ticket ID", "business_name": "Business name", "issue_type": "Issue type", "description": "Ticket description", "urgency": "Urgency level"}')
ON CONFLICT (template_key) DO NOTHING;
`;

console.log(migrationSQL);
console.log('');
console.log('✅ After running the SQL above, your database will be ready!');



















