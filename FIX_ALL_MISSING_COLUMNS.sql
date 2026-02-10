-- ============================================================
-- COMPREHENSIVE DATABASE FIX SCRIPT
-- This adds ALL potentially missing columns across all tables
-- Safe to run multiple times (uses IF NOT EXISTS)
-- ============================================================

-- ============================================================
-- 1. FIX call_sessions TABLE
-- ============================================================

-- Add message_taken column (CRITICAL for dashboard "AI Handled Calls" count)
ALTER TABLE call_sessions
ADD COLUMN IF NOT EXISTS message_taken BOOLEAN DEFAULT FALSE;

-- Add duration_seconds column (CRITICAL for dashboard display)
ALTER TABLE call_sessions
ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;

-- Add transcript column
ALTER TABLE call_sessions
ADD COLUMN IF NOT EXISTS transcript TEXT;

-- Add intent column
ALTER TABLE call_sessions
ADD COLUMN IF NOT EXISTS intent VARCHAR(255);

-- Add ended_at column (CRITICAL for call duration calculation)
ALTER TABLE call_sessions
ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP;

-- Add vapi_call_id column (if not already added)
ALTER TABLE call_sessions
ADD COLUMN IF NOT EXISTS vapi_call_id VARCHAR(255);

-- Add transfer_attempted column (if not already added)
ALTER TABLE call_sessions
ADD COLUMN IF NOT EXISTS transfer_attempted BOOLEAN DEFAULT FALSE;

-- Add transfer_successful column
ALTER TABLE call_sessions
ADD COLUMN IF NOT EXISTS transfer_successful BOOLEAN DEFAULT FALSE;

-- Add transfer_timestamp column
ALTER TABLE call_sessions
ADD COLUMN IF NOT EXISTS transfer_timestamp TIMESTAMP;

-- Make voximplant_call_id nullable (since we're using vapi_call_id now)
-- Note: This might fail if column doesn't exist, that's OK
DO $$
BEGIN
  ALTER TABLE call_sessions ALTER COLUMN voximplant_call_id DROP NOT NULL;
EXCEPTION
  WHEN OTHERS THEN
    -- Column might not exist or already nullable, ignore
    NULL;
END $$;

-- ============================================================
-- 2. FIX usage_minutes TABLE
-- ============================================================

-- Add billing_cycle_start column (CRITICAL for usage tracking)
ALTER TABLE usage_minutes
ADD COLUMN IF NOT EXISTS billing_cycle_start DATE;

-- Add billing_cycle_end column (CRITICAL for usage tracking)
ALTER TABLE usage_minutes
ADD COLUMN IF NOT EXISTS billing_cycle_end DATE;

-- ============================================================
-- 3. FIX businesses TABLE
-- ============================================================

-- Add VAPI-related columns
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS vapi_assistant_id VARCHAR(255);

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS vapi_phone_number VARCHAR(50);

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS public_phone_number VARCHAR(50);

-- Add call forwarding settings
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS call_forward_rings INTEGER DEFAULT 4;

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN DEFAULT TRUE;

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS after_hours_behavior VARCHAR(50) DEFAULT 'take_message';

-- Add SMS settings
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS sms_notification_number VARCHAR(50);

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS sms_enabled BOOLEAN DEFAULT FALSE;

-- Add email notification settings
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS email_ai_answered BOOLEAN DEFAULT TRUE;

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS email_missed_calls BOOLEAN DEFAULT FALSE;

-- Add call recording settings
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS call_recordings_enabled BOOLEAN DEFAULT FALSE;

-- Add pricing settings
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS custom_pricing_monthly DECIMAL(10,2);

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS custom_pricing_overage DECIMAL(10,2);

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS bonus_minutes INTEGER DEFAULT 0;

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS faq_count INTEGER DEFAULT 0;

-- Add billing cycle settings
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS billing_day INTEGER;

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS next_billing_date DATE;

-- Add overage settings
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS overage_billing_enabled BOOLEAN DEFAULT FALSE;

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS overage_cap_minutes INTEGER;

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS minutes_exhausted_behavior VARCHAR(20) DEFAULT 'disable_ai';

-- Add notification settings
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS notify_minutes_almost_used BOOLEAN DEFAULT FALSE;

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS notify_minutes_fully_used BOOLEAN DEFAULT FALSE;

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS notify_overage_charges BOOLEAN DEFAULT FALSE;

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS usage_threshold_percent INTEGER DEFAULT 80;

-- Add call transfer settings
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS allow_call_transfer BOOLEAN DEFAULT TRUE;

-- Add cancellation/deletion settings
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS cancellation_requested_at TIMESTAMP;

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS cancellation_effective_date DATE;

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMP;

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS data_export_requested_at TIMESTAMP;

-- ============================================================
-- 4. FIX ai_agents TABLE
-- ============================================================

-- These should already exist based on your results, but adding for completeness
ALTER TABLE ai_agents
ADD COLUMN IF NOT EXISTS opening_greeting TEXT;

ALTER TABLE ai_agents
ADD COLUMN IF NOT EXISTS ending_greeting TEXT;

ALTER TABLE ai_agents
ADD COLUMN IF NOT EXISTS personality VARCHAR(50) DEFAULT 'professional';

ALTER TABLE ai_agents
ADD COLUMN IF NOT EXISTS voice_provider VARCHAR(50) DEFAULT '11labs';

ALTER TABLE ai_agents
ADD COLUMN IF NOT EXISTS voice_id VARCHAR(100) DEFAULT '21m00Tcm4TlvDq8ikWAM';

-- ============================================================
-- 5. FIX messages TABLE (if needed)
-- ============================================================

-- These should already exist, but adding for safety
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS caller_name VARCHAR(255);

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS caller_phone VARCHAR(50);

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS caller_email VARCHAR(255);

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS message_text TEXT;

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS reason VARCHAR(255);

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- ============================================================
-- 6. CREATE INDEXES (if they don't exist)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_businesses_vapi_assistant_id ON businesses(vapi_assistant_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_vapi_call_id ON call_sessions(vapi_call_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_business_id ON call_sessions(business_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_started_at ON call_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_messages_business_id ON messages(business_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_minutes_business_id ON usage_minutes(business_id);
CREATE INDEX IF NOT EXISTS idx_usage_minutes_billing_cycle ON usage_minutes(billing_cycle_start, billing_cycle_end);

-- ============================================================
-- VERIFICATION QUERY
-- Run this after to verify all columns were added
-- ============================================================

-- Check critical columns for dashboard
SELECT 
  'call_sessions.message_taken' as column_check,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'call_sessions' AND column_name = 'message_taken'
  ) THEN '✅ EXISTS' ELSE '❌ MISSING' END as status
UNION ALL
SELECT 
  'call_sessions.duration_seconds' as column_check,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'call_sessions' AND column_name = 'duration_seconds'
  ) THEN '✅ EXISTS' ELSE '❌ MISSING' END as status
UNION ALL
SELECT 
  'call_sessions.ended_at' as column_check,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'call_sessions' AND column_name = 'ended_at'
  ) THEN '✅ EXISTS' ELSE '❌ MISSING' END as status
UNION ALL
SELECT 
  'usage_minutes.billing_cycle_start' as column_check,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'usage_minutes' AND column_name = 'billing_cycle_start'
  ) THEN '✅ EXISTS' ELSE '❌ MISSING' END as status
UNION ALL
SELECT 
  'usage_minutes.billing_cycle_end' as column_check,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'usage_minutes' AND column_name = 'billing_cycle_end'
  ) THEN '✅ EXISTS' ELSE '❌ MISSING' END as status
UNION ALL
SELECT 
  'businesses.vapi_phone_number' as column_check,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'businesses' AND column_name = 'vapi_phone_number'
  ) THEN '✅ EXISTS' ELSE '❌ MISSING' END as status
UNION ALL
SELECT 
  'businesses.email_missed_calls' as column_check,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'businesses' AND column_name = 'email_missed_calls'
  ) THEN '✅ EXISTS' ELSE '❌ MISSING' END as status;



















