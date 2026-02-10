# Database Migration Instructions

## Problem
The error "Could not find the 'after_hours_behavior' column" means the database migration hasn't been run yet. The `businesses` table is missing the new columns needed for VAPI integration.

## Solution: Run the Migration

### Option 1: Using Supabase Dashboard (Recommended)

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Go to **SQL Editor** (left sidebar)
4. Click **New Query**
5. Copy and paste the SQL below
6. Click **Run** (or press Ctrl+Enter)

### Option 2: Using Supabase CLI (if you have it installed)

```bash
supabase db push
```

## Migration SQL

Copy this entire SQL block and run it in Supabase SQL Editor:

```sql
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
```

## After Running the Migration

1. The migration should complete successfully
2. Try saving your settings again in the dashboard
3. The error should be resolved!

## Verification

To verify the columns were added, you can run this query in Supabase SQL Editor:

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'businesses'
AND column_name IN (
  'after_hours_behavior',
  'ai_enabled',
  'call_forward_rings',
  'allow_call_transfer',
  'email_ai_answered',
  'email_missed_calls',
  'sms_enabled',
  'sms_notification_number'
)
ORDER BY column_name;
```

This should return all the columns we just added.



















