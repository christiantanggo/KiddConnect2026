-- Add metadata column to modules table if it doesn't exist (already exists from reviews module)
-- ALTER TABLE modules ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Insert Orbix Network module into modules table with pricing in metadata
INSERT INTO modules (key, name, description, category, is_active, health_status, version, metadata, created_at, updated_at) 
VALUES (
  'orbix-network',
  'Orbix Network',
  'Automated video news network tracking sudden power shifts',
  'content',
  TRUE,
  'healthy',
  '1.0.0',
  '{
    "pricing": {
      "monthly_price_cents": 9900,
      "currency": "usd",
      "usage_limit": 50,
      "interval": "month"
    },
    "features": {
      "categories": ["ai-automation", "corporate-collapses", "tech-decisions", "laws-rules", "money-markets"],
      "video_templates": ["headline-stat", "before-after", "impact-bullets"],
      "background_randomization": true,
      "youtube_publishing": true,
      "analytics_tracking": true
    }
  }'::jsonb,
  NOW(),
  NOW()
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  is_active = EXCLUDED.is_active,
  health_status = EXCLUDED.health_status,
  version = EXCLUDED.version,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

-- Ensure permissions exist (already exist from v2 migration, but ensure they're there)
INSERT INTO permissions (key, description, created_at) VALUES
  ('use_module', 'Allow user to use module features', NOW()),
  ('configure_module', 'Allow user to configure module settings', NOW())
ON CONFLICT (key) DO NOTHING;

-- Assign permissions to roles (already done in v2 migration, but ensure)
INSERT INTO role_permissions (role, permission_key) VALUES
  ('owner', 'use_module'),
  ('owner', 'configure_module'),
  ('admin', 'use_module'),
  ('admin', 'configure_module'),
  ('staff', 'use_module')
ON CONFLICT (role, permission_key) DO NOTHING;

