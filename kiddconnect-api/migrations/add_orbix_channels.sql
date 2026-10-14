-- Multi-channel support for Orbix Network
-- Each business can have multiple channels; each channel has its own sources, raw items, and stories.

-- 1. Create channels table
CREATE TABLE IF NOT EXISTS orbix_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orbix_channels_business_id ON orbix_channels(business_id);

-- 2. Add channel_id to orbix_sources (nullable first for backfill)
ALTER TABLE orbix_sources
  ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES orbix_channels(id) ON DELETE CASCADE;

-- 3. Add channel_id to orbix_raw_items
ALTER TABLE orbix_raw_items
  ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES orbix_channels(id) ON DELETE CASCADE;

-- 4. Add channel_id to orbix_stories
ALTER TABLE orbix_stories
  ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES orbix_channels(id) ON DELETE CASCADE;

-- 5. Backfill: create one "Default" channel per business that has existing Orbix data
INSERT INTO orbix_channels (business_id, name)
SELECT DISTINCT biz.business_id, 'Default'
FROM (
  SELECT business_id FROM orbix_sources
  UNION
  SELECT business_id FROM orbix_raw_items
  UNION
  SELECT business_id FROM orbix_stories
) AS biz
WHERE NOT EXISTS (SELECT 1 FROM orbix_channels c WHERE c.business_id = biz.business_id);

-- 6. Backfill orbix_sources.channel_id
UPDATE orbix_sources s
SET channel_id = (SELECT id FROM orbix_channels c WHERE c.business_id = s.business_id ORDER BY c.created_at ASC LIMIT 1)
WHERE s.channel_id IS NULL;

-- 7. Backfill orbix_raw_items.channel_id
UPDATE orbix_raw_items r
SET channel_id = (SELECT id FROM orbix_channels c WHERE c.business_id = r.business_id ORDER BY c.created_at ASC LIMIT 1)
WHERE r.channel_id IS NULL;

-- 8. Backfill orbix_stories.channel_id
UPDATE orbix_stories st
SET channel_id = (SELECT id FROM orbix_channels c WHERE c.business_id = st.business_id ORDER BY c.created_at ASC LIMIT 1)
WHERE st.channel_id IS NULL;

-- 9. Add indexes for channel_id
CREATE INDEX IF NOT EXISTS idx_orbix_sources_channel_id ON orbix_sources(channel_id);
CREATE INDEX IF NOT EXISTS idx_orbix_raw_items_channel_id ON orbix_raw_items(channel_id);
CREATE INDEX IF NOT EXISTS idx_orbix_stories_channel_id ON orbix_stories(channel_id);

-- Note: We keep channel_id nullable so new businesses can have zero channels until they create one.
-- Application logic should require channel_id when performing channel-scoped operations.
