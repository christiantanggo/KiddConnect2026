-- ============================================================
-- DATABASE COLUMN CHECK SCRIPT
-- Run this in Supabase SQL Editor to check for missing columns
-- ============================================================

-- Check call_sessions table columns
SELECT 
  'call_sessions' as table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'call_sessions'
  AND column_name IN (
    'id', 'business_id', 'voximplant_call_id', 'vapi_call_id',
    'caller_number', 'caller_name', 'status', 'started_at', 'ended_at', 'created_at',
    'duration_seconds', 'transcript', 'intent', 'message_taken',
    'transfer_attempted', 'transfer_successful', 'transfer_timestamp'
  )
ORDER BY column_name;

-- Check messages table columns
SELECT 
  'messages' as table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'messages'
  AND column_name IN (
    'id', 'business_id', 'call_session_id',
    'caller_name', 'caller_phone', 'caller_email',
    'message_text', 'reason',
    'created_at', 'is_read', 'deleted_at'
  )
ORDER BY column_name;

-- Check businesses table columns (critical VAPI columns)
SELECT 
  'businesses' as table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'businesses'
  AND column_name IN (
    'vapi_assistant_id', 'vapi_phone_number', 'public_phone_number',
    'call_forward_rings', 'ai_enabled', 'after_hours_behavior',
    'sms_notification_number', 'sms_enabled',
    'email_ai_answered', 'email_missed_calls',
    'call_recordings_enabled', 'custom_pricing_monthly', 'custom_pricing_overage',
    'bonus_minutes', 'faq_count', 'billing_day', 'next_billing_date',
    'overage_billing_enabled', 'overage_cap_minutes', 'minutes_exhausted_behavior',
    'notify_minutes_almost_used', 'notify_minutes_fully_used', 'notify_overage_charges',
    'usage_threshold_percent', 'allow_call_transfer',
    'cancellation_requested_at', 'cancellation_effective_date',
    'deletion_requested_at', 'data_export_requested_at'
  )
ORDER BY column_name;

-- Check usage_minutes table columns
SELECT 
  'usage_minutes' as table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'usage_minutes'
  AND column_name IN (
    'id', 'business_id', 'call_session_id', 'minutes_used',
    'created_at', 'billing_cycle_start', 'billing_cycle_end'
  )
ORDER BY column_name;

-- Check ai_agents table columns
SELECT 
  'ai_agents' as table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'ai_agents'
  AND column_name IN (
    'id', 'business_id', 'opening_greeting', 'ending_greeting',
    'personality', 'voice_provider', 'voice_id'
  )
ORDER BY column_name;

-- ============================================================
-- SUMMARY: Check which columns are MISSING
-- ============================================================

-- Missing columns in call_sessions
SELECT 
  'call_sessions' as table_name,
  'MISSING: message_taken' as issue
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns 
  WHERE table_name = 'call_sessions' AND column_name = 'message_taken'
)
UNION ALL
SELECT 
  'call_sessions' as table_name,
  'MISSING: duration_seconds' as issue
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns 
  WHERE table_name = 'call_sessions' AND column_name = 'duration_seconds'
)
UNION ALL
SELECT 
  'call_sessions' as table_name,
  'MISSING: transcript' as issue
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns 
  WHERE table_name = 'call_sessions' AND column_name = 'transcript'
)
UNION ALL
SELECT 
  'call_sessions' as table_name,
  'MISSING: intent' as issue
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns 
  WHERE table_name = 'call_sessions' AND column_name = 'intent'
)
UNION ALL
SELECT 
  'call_sessions' as table_name,
  'MISSING: ended_at' as issue
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns 
  WHERE table_name = 'call_sessions' AND column_name = 'ended_at'
)
UNION ALL
SELECT 
  'call_sessions' as table_name,
  'MISSING: vapi_call_id' as issue
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns 
  WHERE table_name = 'call_sessions' AND column_name = 'vapi_call_id'
)
UNION ALL
SELECT 
  'call_sessions' as table_name,
  'MISSING: transfer_attempted' as issue
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns 
  WHERE table_name = 'call_sessions' AND column_name = 'transfer_attempted'
);

-- Missing columns in usage_minutes
SELECT 
  'usage_minutes' as table_name,
  'MISSING: billing_cycle_start' as issue
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns 
  WHERE table_name = 'usage_minutes' AND column_name = 'billing_cycle_start'
)
UNION ALL
SELECT 
  'usage_minutes' as table_name,
  'MISSING: billing_cycle_end' as issue
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns 
  WHERE table_name = 'usage_minutes' AND column_name = 'billing_cycle_end'
);

-- Missing columns in businesses (check a few critical ones)
SELECT 
  'businesses' as table_name,
  'MISSING: vapi_assistant_id' as issue
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns 
  WHERE table_name = 'businesses' AND column_name = 'vapi_assistant_id'
)
UNION ALL
SELECT 
  'businesses' as table_name,
  'MISSING: vapi_phone_number' as issue
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns 
  WHERE table_name = 'businesses' AND column_name = 'vapi_phone_number'
)
UNION ALL
SELECT 
  'businesses' as table_name,
  'MISSING: email_missed_calls' as issue
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns 
  WHERE table_name = 'businesses' AND column_name = 'email_missed_calls'
);

-- Missing columns in ai_agents
SELECT 
  'ai_agents' as table_name,
  'MISSING: opening_greeting' as issue
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns 
  WHERE table_name = 'ai_agents' AND column_name = 'opening_greeting'
)
UNION ALL
SELECT 
  'ai_agents' as table_name,
  'MISSING: ending_greeting' as issue
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns 
  WHERE table_name = 'ai_agents' AND column_name = 'ending_greeting'
)
UNION ALL
SELECT 
  'ai_agents' as table_name,
  'MISSING: personality' as issue
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns 
  WHERE table_name = 'ai_agents' AND column_name = 'personality'
)
UNION ALL
SELECT 
  'ai_agents' as table_name,
  'MISSING: voice_provider' as issue
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns 
  WHERE table_name = 'ai_agents' AND column_name = 'voice_provider'
)
UNION ALL
SELECT 
  'ai_agents' as table_name,
  'MISSING: voice_id' as issue
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns 
  WHERE table_name = 'ai_agents' AND column_name = 'voice_id'
);



















