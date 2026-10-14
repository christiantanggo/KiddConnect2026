-- Create takeout_orders table
CREATE TABLE IF NOT EXISTS takeout_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  call_session_id UUID REFERENCES call_sessions(id) ON DELETE SET NULL,
  vapi_call_id VARCHAR(255),
  
  -- Customer information
  customer_name VARCHAR(255),
  customer_phone VARCHAR(50) NOT NULL,
  customer_email VARCHAR(255),
  
  -- Order details
  order_number VARCHAR(50) NOT NULL, -- e.g., "TO-2026-001"
  order_type VARCHAR(20) DEFAULT 'takeout', -- For future: 'takeout', 'delivery', 'dine_in'
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'
  special_instructions TEXT,
  
  -- Pricing
  subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0,
  tax DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total DECIMAL(10, 2) NOT NULL DEFAULT 0,
  
  -- Timing
  estimated_ready_time TIMESTAMP,
  confirmed_at TIMESTAMP,
  started_preparing_at TIMESTAMP,
  ready_at TIMESTAMP,
  completed_at TIMESTAMP,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- Create takeout_order_items table
CREATE TABLE IF NOT EXISTS takeout_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES takeout_orders(id) ON DELETE CASCADE,
  
  -- Item reference (links to menu_items for consistency)
  menu_item_id UUID REFERENCES menu_items(id) ON DELETE SET NULL, -- NULL if item was deleted
  item_number INTEGER, -- Store item number for reference even if menu item is deleted
  
  -- Item details (denormalized for historical record)
  item_name VARCHAR(255) NOT NULL,
  item_description TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  item_total DECIMAL(10, 2) NOT NULL DEFAULT 0, -- quantity * unit_price
  
  -- Modifications/customizations
  modifications TEXT, -- JSON or text description of modifications (e.g., "No onions, extra cheese")
  special_instructions TEXT,
  
  -- Metadata for future phases
  -- For order-out API integration
  external_order_item_id VARCHAR(255), -- ID in external ordering system if synced
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_takeout_orders_business_id ON takeout_orders(business_id);
CREATE INDEX IF NOT EXISTS idx_takeout_orders_status ON takeout_orders(status);
CREATE INDEX IF NOT EXISTS idx_takeout_orders_created_at ON takeout_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_takeout_orders_call_session_id ON takeout_orders(call_session_id);
CREATE INDEX IF NOT EXISTS idx_takeout_orders_vapi_call_id ON takeout_orders(vapi_call_id);
CREATE INDEX IF NOT EXISTS idx_takeout_orders_order_number ON takeout_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_takeout_order_items_order_id ON takeout_order_items(order_id);

-- Add comment for documentation
COMMENT ON TABLE takeout_orders IS 'Stores take-out orders placed via phone calls to AI assistant';
COMMENT ON TABLE takeout_order_items IS 'Stores individual items within each take-out order';

