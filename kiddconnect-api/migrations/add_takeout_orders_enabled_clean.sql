ALTER TABLE businesses ADD COLUMN IF NOT EXISTS takeout_orders_enabled BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_businesses_takeout_orders_enabled ON businesses(takeout_orders_enabled) WHERE takeout_orders_enabled = TRUE;

