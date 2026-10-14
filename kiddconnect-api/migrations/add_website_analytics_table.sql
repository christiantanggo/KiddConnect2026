-- Create website_analytics table to track user interactions on the website
CREATE TABLE IF NOT EXISTS website_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  label VARCHAR(255),
  action VARCHAR(100),
  value DECIMAL(10,2),
  location VARCHAR(255),
  custom_data JSONB,
  url TEXT,
  path VARCHAR(500),
  referrer TEXT,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_website_analytics_event_name ON website_analytics(event_name);
CREATE INDEX IF NOT EXISTS idx_website_analytics_category ON website_analytics(category);
CREATE INDEX IF NOT EXISTS idx_website_analytics_location ON website_analytics(location);
CREATE INDEX IF NOT EXISTS idx_website_analytics_created_at ON website_analytics(created_at);
CREATE INDEX IF NOT EXISTS idx_website_analytics_path ON website_analytics(path);

-- Index for date range queries
CREATE INDEX IF NOT EXISTS idx_website_analytics_category_created_at ON website_analytics(category, created_at);

COMMENT ON TABLE website_analytics IS 'Tracks user interactions (button clicks, page views, etc.) on the website for analytics';

