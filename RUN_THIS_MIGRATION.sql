-- CRITICAL: Run this migration in Supabase SQL Editor to fix all missing columns
-- This fixes the errors you're seeing in the logs

-- Add missing columns to businesses table
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

-- Add missing columns to usage_minutes table (THIS FIXES THE ERROR YOU'RE SEEING)
ALTER TABLE usage_minutes
ADD COLUMN IF NOT EXISTS billing_cycle_start DATE,
ADD COLUMN IF NOT EXISTS billing_cycle_end DATE;

-- Add missing columns to call_sessions table
ALTER TABLE call_sessions
ADD COLUMN IF NOT EXISTS vapi_call_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS transfer_attempted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS transfer_successful BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS transfer_timestamp TIMESTAMP;

-- Make voximplant_call_id nullable (since we're using vapi_call_id now)
ALTER TABLE call_sessions
ALTER COLUMN voximplant_call_id DROP NOT NULL;

-- Add greeting, personality, and voice fields to ai_agents table
ALTER TABLE ai_agents 
ADD COLUMN IF NOT EXISTS opening_greeting TEXT,
ADD COLUMN IF NOT EXISTS ending_greeting TEXT,
ADD COLUMN IF NOT EXISTS personality VARCHAR(50) DEFAULT 'professional',
ADD COLUMN IF NOT EXISTS voice_provider VARCHAR(50) DEFAULT '11labs',
ADD COLUMN IF NOT EXISTS voice_id VARCHAR(100) DEFAULT '21m00Tcm4TlvDq8ikWAM';

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_businesses_vapi_assistant_id ON businesses(vapi_assistant_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_vapi_call_id ON call_sessions(vapi_call_id);
















