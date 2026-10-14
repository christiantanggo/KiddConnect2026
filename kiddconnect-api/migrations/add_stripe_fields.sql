-- Add Stripe payment fields to businesses table
-- Run this migration to add support for Stripe payment processing

ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS stripe_subscription_status VARCHAR(50);

-- Add indexes for Stripe lookups
CREATE INDEX IF NOT EXISTS idx_businesses_stripe_customer_id ON businesses(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_businesses_stripe_subscription_id ON businesses(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;


