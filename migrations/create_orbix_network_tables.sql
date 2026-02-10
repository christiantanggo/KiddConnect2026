-- Orbix Network Module Tables
-- Sources: News sources to scrape
CREATE TABLE IF NOT EXISTS orbix_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('RSS', 'HTML')),
  enabled BOOLEAN DEFAULT TRUE,
  fetch_interval_minutes INTEGER DEFAULT 60,
  category_hint VARCHAR(50),
  last_fetched_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orbix_sources_business_id ON orbix_sources(business_id);
CREATE INDEX IF NOT EXISTS idx_orbix_sources_enabled ON orbix_sources(enabled);

-- Raw Items: Scraped news items before processing
CREATE TABLE IF NOT EXISTS orbix_raw_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  source_id UUID REFERENCES orbix_sources(id) ON DELETE SET NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  snippet TEXT,
  published_at TIMESTAMP,
  fetched_at TIMESTAMP DEFAULT NOW(),
  hash VARCHAR(64) NOT NULL, -- SHA-256 hash for deduplication
  status VARCHAR(20) DEFAULT 'NEW' CHECK (status IN ('NEW', 'DISCARDED', 'PROCESSED')),
  discard_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(business_id, url)
);

CREATE INDEX IF NOT EXISTS idx_orbix_raw_items_business_id ON orbix_raw_items(business_id);
CREATE INDEX IF NOT EXISTS idx_orbix_raw_items_status ON orbix_raw_items(status);
CREATE INDEX IF NOT EXISTS idx_orbix_raw_items_hash ON orbix_raw_items(hash);

-- Stories: Processed and classified stories
CREATE TABLE IF NOT EXISTS orbix_stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  raw_item_id UUID REFERENCES orbix_raw_items(id) ON DELETE SET NULL,
  category VARCHAR(50) NOT NULL CHECK (category IN ('ai-automation', 'corporate-collapses', 'tech-decisions', 'laws-rules', 'money-markets')),
  shock_score INTEGER NOT NULL CHECK (shock_score >= 0 AND shock_score <= 100),
  factors_json JSONB NOT NULL, -- Store scoring factors
  status VARCHAR(20) DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'REJECTED', 'APPROVED', 'RENDERED', 'PUBLISHED')),
  decision_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orbix_stories_business_id ON orbix_stories(business_id);
CREATE INDEX IF NOT EXISTS idx_orbix_stories_status ON orbix_stories(status);
CREATE INDEX IF NOT EXISTS idx_orbix_stories_category ON orbix_stories(category);
CREATE INDEX IF NOT EXISTS idx_orbix_stories_shock_score ON orbix_stories(shock_score DESC);

-- Scripts: Generated scripts for videos
CREATE TABLE IF NOT EXISTS orbix_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  story_id UUID NOT NULL REFERENCES orbix_stories(id) ON DELETE CASCADE,
  hook TEXT NOT NULL,
  what_happened TEXT NOT NULL,
  why_it_matters TEXT NOT NULL,
  what_happens_next TEXT NOT NULL,
  cta_line TEXT,
  duration_target_seconds INTEGER DEFAULT 35,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orbix_scripts_story_id ON orbix_scripts(story_id);
CREATE INDEX IF NOT EXISTS idx_orbix_scripts_business_id ON orbix_scripts(business_id);

-- Review Queue: Human review queue (optional)
CREATE TABLE IF NOT EXISTS orbix_review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  story_id UUID NOT NULL REFERENCES orbix_stories(id) ON DELETE CASCADE,
  script_id UUID NOT NULL REFERENCES orbix_scripts(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  edited_hook TEXT,
  reviewed_at TIMESTAMP,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orbix_review_queue_business_id ON orbix_review_queue(business_id);
CREATE INDEX IF NOT EXISTS idx_orbix_review_queue_status ON orbix_review_queue(status);

-- Renders: Video render jobs and results
CREATE TABLE IF NOT EXISTS orbix_renders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  story_id UUID NOT NULL REFERENCES orbix_stories(id) ON DELETE CASCADE,
  script_id UUID NOT NULL REFERENCES orbix_scripts(id) ON DELETE CASCADE,
  template VARCHAR(10) NOT NULL CHECK (template IN ('A', 'B', 'C')),
  background_type VARCHAR(10) NOT NULL CHECK (background_type IN ('STILL', 'MOTION')),
  background_id INTEGER NOT NULL, -- 1-6 for stills, 7-12 for motion
  output_url TEXT, -- Supabase Storage URL
  render_status VARCHAR(20) DEFAULT 'PENDING' CHECK (render_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  ffmpeg_log TEXT,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orbix_renders_business_id ON orbix_renders(business_id);
CREATE INDEX IF NOT EXISTS idx_orbix_renders_status ON orbix_renders(render_status);
CREATE INDEX IF NOT EXISTS idx_orbix_renders_story_id ON orbix_renders(story_id);

-- Publishes: YouTube/Rumble publishing records
CREATE TABLE IF NOT EXISTS orbix_publishes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  render_id UUID NOT NULL REFERENCES orbix_renders(id) ON DELETE CASCADE,
  platform VARCHAR(20) NOT NULL CHECK (platform IN ('YOUTUBE', 'RUMBLE')),
  platform_video_id VARCHAR(255),
  title TEXT NOT NULL,
  description TEXT,
  publish_status VARCHAR(20) DEFAULT 'PENDING' CHECK (publish_status IN ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED')),
  posted_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orbix_publishes_business_id ON orbix_publishes(business_id);
CREATE INDEX IF NOT EXISTS idx_orbix_publishes_render_id ON orbix_publishes(render_id);
CREATE INDEX IF NOT EXISTS idx_orbix_publishes_platform ON orbix_publishes(platform);
CREATE INDEX IF NOT EXISTS idx_orbix_publishes_status ON orbix_publishes(publish_status);

-- Analytics: Daily performance metrics
CREATE TABLE IF NOT EXISTS orbix_analytics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  platform_video_id VARCHAR(255) NOT NULL,
  date DATE NOT NULL,
  views INTEGER DEFAULT 0,
  avg_watch_time_seconds INTEGER DEFAULT 0,
  completion_rate DECIMAL(5,2) DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(business_id, platform_video_id, date)
);

CREATE INDEX IF NOT EXISTS idx_orbix_analytics_business_id ON orbix_analytics_daily(business_id);
CREATE INDEX IF NOT EXISTS idx_orbix_analytics_platform_video_id ON orbix_analytics_daily(platform_video_id);
CREATE INDEX IF NOT EXISTS idx_orbix_analytics_date ON orbix_analytics_daily(date DESC);




