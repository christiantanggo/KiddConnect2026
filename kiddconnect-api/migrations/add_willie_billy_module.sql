-- Willie & Billy series bible module.
-- Idempotent. Run in the Supabase SQL editor for the Le Fournier studio database.

INSERT INTO modules (key, name, description, category, is_active, health_status, version, metadata, created_at, updated_at)
VALUES (
  'willie-billy',
  'Willie & Billy',
  'Year-long hide-and-seek series: 730 shorts and 52 chapters, from the bet in Marrow to the real-world porch.',
  'content',
  TRUE,
  'healthy',
  '1.0.0',
  '{
    "pricing": {
      "monthly_price_cents": 0,
      "currency": "usd",
      "interval": "month"
    },
    "features": {
      "series_bible": true,
      "shorts": 730,
      "chapters": 52
    }
  }'::jsonb,
  NOW(),
  NOW()
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  health_status = EXCLUDED.health_status,
  version = EXCLUDED.version,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();
