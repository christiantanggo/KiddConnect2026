-- Delivery-dispatch uses same billing as rest of app: set pricing in module metadata.
-- Activation will create a Stripe subscription item on the business's main subscription.
UPDATE modules
SET metadata = COALESCE(metadata, '{}'::jsonb) || '{
  "pricing": {
    "monthly_price_cents": 2900,
    "currency": "usd",
    "usage_limit": null,
    "interval": "month"
  }
}'::jsonb,
updated_at = NOW()
WHERE key = 'delivery-dispatch';
