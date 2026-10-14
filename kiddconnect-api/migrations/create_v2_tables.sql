-- TAVARI AI CORE v2 - Database Migration
-- Creates all v2 tables for the new modular, multi-tenant platform
-- Run this in Supabase SQL Editor or via your migration script

-- ============================================================
-- ORGANIZATION & USER MANAGEMENT
-- ============================================================

-- organization_users: Multi-organization membership (source of truth for authorization)
-- Note: Uses business_id (not organization_id) - businesses table IS organizations
CREATE TABLE IF NOT EXISTS organization_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL DEFAULT 'staff' CHECK (role IN ('owner', 'admin', 'staff')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,
  UNIQUE(business_id, user_id, deleted_at)
);

CREATE INDEX IF NOT EXISTS idx_organization_users_business_id ON organization_users(business_id);
CREATE INDEX IF NOT EXISTS idx_organization_users_user_id ON organization_users(user_id);
CREATE INDEX IF NOT EXISTS idx_organization_users_role ON organization_users(role);

-- organization_join_requests: Track requests to join organizations (pending approval)
CREATE TABLE IF NOT EXISTS organization_join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_role VARCHAR(50) DEFAULT 'staff' CHECK (requested_role IN ('owner', 'admin', 'staff')),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  message TEXT,
  responded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  responded_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(business_id, user_id, status) -- Only one pending request per user-organization pair
);

CREATE INDEX IF NOT EXISTS idx_organization_join_requests_business_id ON organization_join_requests(business_id);
CREATE INDEX IF NOT EXISTS idx_organization_join_requests_user_id ON organization_join_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_organization_join_requests_status ON organization_join_requests(status);

-- ============================================================
-- MODULE REGISTRY
-- ============================================================

-- modules: Module registry with health status
CREATE TABLE IF NOT EXISTS modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50),
  icon_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  health_status VARCHAR(20) DEFAULT 'healthy' CHECK (health_status IN ('healthy', 'degraded', 'offline')),
  version VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add category column if table exists but column is missing (for existing tables)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'modules') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'modules' AND column_name = 'category') THEN
      ALTER TABLE modules ADD COLUMN category VARCHAR(50);
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_modules_key ON modules(key);
CREATE INDEX IF NOT EXISTS idx_modules_active ON modules(is_active);

-- ============================================================
-- BILLING & SUBSCRIPTIONS
-- ============================================================

-- subscriptions: Unified billing with Stripe subscription items
-- Note: One Stripe subscription per business (in businesses.stripe_subscription_id)
-- Module entitlements managed via subscription items (stripe_subscription_item_id here)
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  module_key VARCHAR(100) NOT NULL REFERENCES modules(key),
  plan VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'canceled', 'expired', 'past_due')),
  stripe_subscription_item_id VARCHAR(255) UNIQUE,
  usage_limit INTEGER,
  usage_limit_reset_date DATE,
  started_at TIMESTAMP DEFAULT NOW(),
  ends_at TIMESTAMP,
  trial_ends_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(business_id, module_key)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_business_id ON subscriptions(business_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_module_key ON subscriptions(module_key);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_item_id ON subscriptions(stripe_subscription_item_id);

-- ============================================================
-- USAGE TRACKING
-- ============================================================

-- usage_logs: Per-module usage tracking
CREATE TABLE IF NOT EXISTS usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  module_key VARCHAR(100) NOT NULL REFERENCES modules(key),
  action VARCHAR(100) NOT NULL,
  units_used DECIMAL(10, 2) DEFAULT 1,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_logs_business_id ON usage_logs(business_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_module_key ON usage_logs(module_key);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_logs_business_module_date ON usage_logs(business_id, module_key, created_at);

-- ai_requests: AI request tracking for token usage
CREATE TABLE IF NOT EXISTS ai_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  module_key VARCHAR(100) NOT NULL REFERENCES modules(key),
  prompt_type VARCHAR(100),
  input TEXT,
  output TEXT,
  tokens_used INTEGER,
  model VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_requests_business_id ON ai_requests(business_id);
CREATE INDEX IF NOT EXISTS idx_ai_requests_module_key ON ai_requests(module_key);
CREATE INDEX IF NOT EXISTS idx_ai_requests_created_at ON ai_requests(created_at);

-- ============================================================
-- MODULE SETTINGS
-- ============================================================

-- module_settings: Per-business module configuration
CREATE TABLE IF NOT EXISTS module_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  module_key VARCHAR(100) NOT NULL REFERENCES modules(key),
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(business_id, module_key)
);

CREATE INDEX IF NOT EXISTS idx_module_settings_business_id ON module_settings(business_id);
CREATE INDEX IF NOT EXISTS idx_module_settings_module_key ON module_settings(module_key);

-- ============================================================
-- PERMISSIONS & ROLES
-- ============================================================

-- permissions: Permission registry
CREATE TABLE IF NOT EXISTS permissions (
  key VARCHAR(100) PRIMARY KEY,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- role_permissions: Role-based permission mapping
CREATE TABLE IF NOT EXISTS role_permissions (
  role VARCHAR(50) NOT NULL,
  permission_key VARCHAR(100) NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
  PRIMARY KEY (role, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role);

-- ============================================================
-- AUDIT & NOTIFICATIONS
-- ============================================================

-- audit_logs: Comprehensive audit logging
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  admin_user_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  action VARCHAR(255) NOT NULL,
  resource_type VARCHAR(100),
  resource_id UUID,
  metadata JSONB,
  ip_address VARCHAR(50),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_business_id ON audit_logs(business_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- notifications: Business/user notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('info', 'warning', 'billing', 'limit', 'module')),
  message TEXT NOT NULL,
  metadata JSONB,
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_business_id ON notifications(business_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read_at ON notifications(read_at);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

-- ============================================================
-- EXTERNAL PURCHASES
-- ============================================================

-- external_purchases: ClickBank and other external purchases
CREATE TABLE IF NOT EXISTS external_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL DEFAULT 'clickbank',
  external_order_id VARCHAR(255) NOT NULL,
  business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  module_key VARCHAR(100),
  email VARCHAR(255),
  amount DECIMAL(10, 2),
  currency VARCHAR(3) DEFAULT 'USD',
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'refunded', 'canceled')),
  purchase_data JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(provider, external_order_id)
);

CREATE INDEX IF NOT EXISTS idx_external_purchases_provider_order ON external_purchases(provider, external_order_id);
CREATE INDEX IF NOT EXISTS idx_external_purchases_business_id ON external_purchases(business_id);
CREATE INDEX IF NOT EXISTS idx_external_purchases_email ON external_purchases(email);
CREATE INDEX IF NOT EXISTS idx_external_purchases_status ON external_purchases(status);

-- ============================================================
-- PLATFORM VERSIONING
-- ============================================================

-- platform_version: Platform version tracking for feature rollout
CREATE TABLE IF NOT EXISTS platform_version (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version VARCHAR(50) NOT NULL,
  description TEXT,
  metadata JSONB,
  applied_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_version_version ON platform_version(version);
CREATE INDEX IF NOT EXISTS idx_platform_version_applied_at ON platform_version(applied_at);

-- ============================================================
-- SEED INITIAL DATA
-- ============================================================

-- Insert default permissions
INSERT INTO permissions (key, description) VALUES
  ('configure_module', 'Configure module settings'),
  ('manage_billing', 'Manage billing and subscriptions'),
  ('manage_users', 'Manage organization users'),
  ('view_audit_logs', 'View audit logs'),
  ('use_module', 'Use module features')
ON CONFLICT (key) DO NOTHING;

-- Insert default role permissions
-- Owner: All permissions
INSERT INTO role_permissions (role, permission_key) VALUES
  ('owner', 'configure_module'),
  ('owner', 'manage_billing'),
  ('owner', 'manage_users'),
  ('owner', 'view_audit_logs'),
  ('owner', 'use_module')
ON CONFLICT DO NOTHING;

-- Admin: Most permissions (not billing management)
INSERT INTO role_permissions (role, permission_key) VALUES
  ('admin', 'configure_module'),
  ('admin', 'manage_users'),
  ('admin', 'view_audit_logs'),
  ('admin', 'use_module')
ON CONFLICT DO NOTHING;

-- Staff: Read-only access
INSERT INTO role_permissions (role, permission_key) VALUES
  ('staff', 'use_module')
ON CONFLICT DO NOTHING;

-- Insert Phone Agent module (existing module)
INSERT INTO modules (key, name, description, category, is_active, health_status) VALUES
  ('phone-agent', 'Tavari AI Phone Agent', 'AI phone answering system', 'communication', TRUE, 'healthy')
ON CONFLICT (key) DO NOTHING;

-- Insert initial platform version
INSERT INTO platform_version (version, description, metadata) VALUES
  ('2.0.0', 'Tavari AI Core Foundation v2 - Initial release', '{"phase": 1, "features": ["organizations", "modules", "subscriptions"]}')
ON CONFLICT DO NOTHING;

-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
