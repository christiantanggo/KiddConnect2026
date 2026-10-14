-- Add metadata column to modules table if it doesn't exist
ALTER TABLE modules 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Create index on metadata for faster queries (if needed in the future)
CREATE INDEX IF NOT EXISTS idx_modules_metadata ON modules USING gin(metadata);

-- Insert Review Reply AI module into modules table with pricing in metadata
INSERT INTO modules (key, name, description, category, is_active, health_status, version, metadata, created_at, updated_at) 
VALUES (
  'reviews',
  'Tavari AI Review Reply',
  'AI-powered Google review reply generator with tone-safe responses',
  'communication',
  TRUE,
  'healthy',
  '1.0.0',
  '{
    "pricing": {
      "monthly_price_cents": 2900,
      "currency": "usd",
      "usage_limit": 100,
      "interval": "month"
    },
    "features": {
      "tone_options": ["calm", "friendly", "professional", "firm"],
      "length_options": ["short", "medium", "long"],
      "risk_detection": true,
      "custom_branding": true
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

-- reviews_outputs: Store generated review replies
CREATE TABLE IF NOT EXISTS reviews_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  module_key VARCHAR(50) NOT NULL DEFAULT 'reviews',
  prompt_type VARCHAR(100) NOT NULL DEFAULT 'reviews.reply',
  input JSONB NOT NULL,
  output JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reviews_outputs_business_id ON reviews_outputs(business_id);
CREATE INDEX IF NOT EXISTS idx_reviews_outputs_user_id ON reviews_outputs(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_outputs_created_at ON reviews_outputs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_outputs_module_key ON reviews_outputs(module_key);
CREATE INDEX IF NOT EXISTS idx_reviews_outputs_business_created ON reviews_outputs(business_id, created_at DESC);

-- module_setup_state: Track module setup progress
CREATE TABLE IF NOT EXISTS module_setup_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  module_key VARCHAR(50) NOT NULL REFERENCES modules(key),
  current_step INTEGER DEFAULT 1,
  completed_steps JSONB DEFAULT '[]'::jsonb,
  setup_data JSONB DEFAULT '{}'::jsonb,
  is_complete BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(business_id, module_key)
);

CREATE INDEX IF NOT EXISTS idx_module_setup_state_business_id ON module_setup_state(business_id);
CREATE INDEX IF NOT EXISTS idx_module_setup_state_module_key ON module_setup_state(module_key);
CREATE INDEX IF NOT EXISTS idx_module_setup_state_is_complete ON module_setup_state(is_complete);

