# Orbix Network Module - Adapted Build Plan

**Status**: Planning Phase  
**Last Updated**: 2024  
**Module Key**: `orbix-network`

## Overview

This document adapts the original Orbix Network specification to fit the Tavari AI module architecture. All functionality from the original spec is preserved, but implemented using:

- **Node.js/Express** (instead of Python workers)
- **Tavari Module System** (instead of standalone infrastructure)
- **Supabase Database** (shared with Tavari platform)
- **Integrated Admin UI** (instead of separate Vercel app)

## Core Functionality (Preserved from Original Spec)

✅ Scrapes public news sources continuously  
✅ Filters and scores stories using AI  
✅ Generates short scripts  
✅ Optional human review (approve/edit/reject)  
✅ Automatically renders faceless studio-style videos (NO AI host)  
✅ Publishes videos to YouTube Shorts (optionally Rumble)  
✅ Tracks performance (including backdrop testing)  
✅ Runs 24/7 without manual editing software  

## Content Rules (Preserved)

Only create videos for **Sudden Power Shifts** in exactly 5 categories:

1. **AI & Automation Takeovers**
2. **Corporate Collapses & Reversals**
3. **Tech Decisions With Massive Fallout**
4. **Laws & Rules That Quietly Changed Everything**
5. **Money & Market Shock** (NO stock picks, NO financial advice)

**Disallowed:**
- Political rage framing
- Graphic violence or tragedy
- Speculation language ("might", "could", "probably")
- AI avatars or talking heads
- Manual editing workflows

## Video Style (Preserved)

- Studio aesthetic (Joe Rogan-style), but NO visible host
- Text appears inside the space
- Calm, authoritative AI voiceover
- 12 studio backdrops total:
  - 6 still images → animated with subtle zoom/parallax
  - 6 looping MP4s → baked-in motion
- Random selection at render time (50% still, 50% motion)
- Never tie a background to a category

---

## Architecture Overview

### Technology Stack

- **Backend**: Node.js/Express (existing Tavari backend)
- **Database**: Supabase PostgreSQL (shared with Tavari)
- **Frontend**: Next.js (existing Tavari frontend)
- **Background Jobs**: Node.js `setInterval`/scheduled tasks
- **Video Rendering**: FFmpeg (via Node.js `child_process`)
- **YouTube API**: Node.js YouTube Data API v3
- **AI Processing**: OpenAI API (via Node.js)

### Integration Points

- **Module Registration**: `modules` table
- **Billing**: `subscriptions` table (via Tavari billing system)
- **Settings**: `module_settings` table
- **Setup State**: `module_setup_state` table
- **Audit Logging**: `audit_logs` table

---

## Phase 1: Database Schema

### 1.1 Module Registration

**File**: `migrations/add_orbix_network_module.sql`

```sql
-- Add metadata column if it doesn't exist (already exists from reviews module)
-- ALTER TABLE modules ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Insert Orbix Network module
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
```

### 1.2 Orbix Network Tables

**File**: `migrations/create_orbix_network_tables.sql`

```sql
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
```

---

## Phase 2: Backend API Routes

### 2.1 Module Setup Routes

**File**: `routes/v2/orbix-network-setup.js`

**Endpoints**:
- `GET /api/v2/orbix-network/setup/status` - Get setup status
- `POST /api/v2/orbix-network/setup/start` - Start setup
- `POST /api/v2/orbix-network/setup/save` - Save setup step data
- `POST /api/v2/orbix-network/setup/complete` - Complete setup

**Setup Steps**:
1. YouTube API credentials
2. Source configuration (optional - can add later)
3. Review preferences (enable/disable review mode, auto-approve minutes)
4. Publishing preferences (YouTube visibility, Rumble enabled)
5. Background preferences (randomization mode)

### 2.2 Main Module Routes

**File**: `routes/v2/orbix-network.js`

**Endpoints**:
- `GET /api/v2/orbix-network/stories` - List stories (with filters)
- `GET /api/v2/orbix-network/stories/:id` - Get story details
- `POST /api/v2/orbix-network/stories/:id/approve` - Approve story
- `POST /api/v2/orbix-network/stories/:id/reject` - Reject story
- `POST /api/v2/orbix-network/stories/:id/script/edit-hook` - Edit script hook
- `GET /api/v2/orbix-network/renders` - List renders
- `GET /api/v2/orbix-network/renders/:id` - Get render details (with video URL)
- `GET /api/v2/orbix-network/publishes` - List published videos
- `GET /api/v2/orbix-network/analytics` - Get analytics data
- `GET /api/v2/orbix-network/sources` - List/manage sources
- `POST /api/v2/orbix-network/sources` - Add source
- `PUT /api/v2/orbix-network/sources/:id` - Update source
- `DELETE /api/v2/orbix-network/sources/:id` - Delete source

### 2.3 Background Job Routes (Internal)

**File**: `routes/v2/orbix-network-jobs.js`

**Endpoints** (called by scheduled tasks):
- `POST /api/v2/orbix-network/jobs/scrape` - Trigger scraping job
- `POST /api/v2/orbix-network/jobs/process` - Process raw items
- `POST /api/v2/orbix-network/jobs/render` - Process render queue
- `POST /api/v2/orbix-network/jobs/publish` - Process publish queue
- `POST /api/v2/orbix-network/jobs/analytics` - Fetch analytics

---

## Phase 3: Services Layer

### 3.1 Scraping Service

**File**: `services/orbix-network/scraper.js`

**Functions**:
- `scrapeSource(source)` - Scrape RSS or HTML source
- `deduplicateItem(businessId, url, hash)` - Check for duplicates
- `saveRawItem(data)` - Save scraped item

**Dependencies**: `rss-parser`, `axios`, `cheerio`

### 3.2 AI Classification Service

**File**: `services/orbix-network/classifier.js`

**Functions**:
- `classifyStory(rawItem)` - Classify into category
- `scoreShock(story)` - Score 0-100 using factors:
  - Scale (0-30)
  - Speed (0-20)
  - Power shift (0-25)
  - Permanence (0-15)
  - Explainability (0-10)
- `shouldProcess(story)` - Check if score meets threshold

**Dependencies**: OpenAI API

### 3.3 Script Generation Service

**File**: `services/orbix-network/script-generator.js`

**Functions**:
- `generateScript(story)` - Generate full script with:
  - Hook (statement, not question)
  - What happened
  - Why it matters
  - What happens next
  - Soft utility CTA

**Tone**: Calm, observational, authoritative

**Dependencies**: OpenAI API

### 3.4 Video Renderer Service

**File**: `services/orbix-network/video-renderer.js`

**Functions**:
- `selectTemplate(story)` - Choose template A/B/C
- `selectBackground()` - Random selection (50% still, 50% motion)
- `renderVideo(renderJob)` - Use FFmpeg to render video
- `uploadToStorage(videoPath)` - Upload to Supabase Storage

**FFmpeg Command Structure**:
- Input: Background (image or video)
- Overlay: Text elements (headline, stat, category)
- Overlay: Orbix watermark
- Output: 1080x1920 (vertical), 30-45 seconds, MP4

**Dependencies**: `fluent-ffmpeg`, `child_process`, Supabase Storage

### 3.5 YouTube Publisher Service

**File**: `services/orbix-network/youtube-publisher.js`

**Functions**:
- `publishVideo(renderId, videoUrl)` - Upload to YouTube Shorts
- `updateVideoMetadata(videoId, metadata)` - Update title/description
- `getVideoAnalytics(videoId)` - Fetch analytics

**Dependencies**: `googleapis` (YouTube Data API v3)

### 3.6 Analytics Service

**File**: `services/orbix-network/analytics.js`

**Functions**:
- `fetchYouTubeAnalytics(videoId)` - Get daily metrics
- `storeAnalytics(data)` - Save to database
- `getAnalyticsComparison(businessId, filters)` - Compare backdrop/template performance

---

## Phase 4: Background Jobs

### 4.1 Scheduled Tasks (server.js)

**File**: `server.js` (add to existing scheduled jobs)

**Jobs**:
1. **Scrape News** (every hour)
   - Call `/api/v2/orbix-network/jobs/scrape`
   - Scrapes all enabled sources

2. **Process Stories** (every 15 minutes)
   - Call `/api/v2/orbix-network/jobs/process`
   - Classifies and scores raw items
   - Generates scripts
   - Adds to review queue (if enabled)

3. **Process Review Queue** (every 5 minutes)
   - Auto-approves items past auto-approve time
   - Moves approved items to render queue

4. **Render Videos** (every 10 minutes)
   - Call `/api/v2/orbix-network/jobs/render`
   - Processes pending renders
   - Uses FFmpeg to render videos

5. **Publish Videos** (every 15 minutes)
   - Call `/api/v2/orbix-network/jobs/publish`
   - Uploads completed renders to YouTube

6. **Fetch Analytics** (daily at 2 AM)
   - Call `/api/v2/orbix-network/jobs/analytics`
   - Fetches YouTube analytics for all published videos

---

## Phase 5: Frontend Pages

### 5.1 Setup Wizard

**File**: `frontend/app/modules/orbix-network/setup/page.jsx`

**Structure**: Multi-step wizard (similar to reviews module)

**Steps**:
1. YouTube API Setup
   - OAuth flow for YouTube API
   - Store credentials in module settings

2. Source Configuration (Optional)
   - Add news sources (RSS/HTML)
   - Can skip and add later

3. Review Preferences
   - Enable/disable review mode
   - Auto-approve minutes (if review enabled)

4. Publishing Preferences
   - YouTube visibility (public/unlisted/private)
   - Enable Rumble (future)

5. Background Preferences
   - Randomization mode (uniform/weighted)

### 5.2 Main Dashboard

**File**: `frontend/app/dashboard/v2/modules/orbix-network/page.jsx`

**Sections**:
- Overview stats (stories processed, videos published, views)
- Recent stories (with status badges)
- Quick actions (manual scrape, approve/reject)
- Recent renders (with video preview)
- Performance chart

### 5.3 Stories Page

**File**: `frontend/app/dashboard/v2/modules/orbix-network/stories/page.jsx`

**Features**:
- Filter by category, status, date
- List of stories with:
  - Title/snippet
  - Category badge
  - Shock score
  - Status (QUEUED/APPROVED/REJECTED)
  - Actions (view, approve, reject, edit hook)
- Story detail modal:
  - Full story content
  - Generated script
  - Edit hook functionality
  - Approve/Reject buttons

### 5.4 Renders Page

**File**: `frontend/app/dashboard/v2/modules/orbix-network/renders/page.jsx`

**Features**:
- List of renders with:
  - Story title
  - Template used
  - Background type/id
  - Status (PENDING/PROCESSING/COMPLETED/FAILED)
  - Video preview (if completed)
  - Download button
  - Publish button

### 5.5 Published Videos Page

**File**: `frontend/app/dashboard/v2/modules/orbix-network/published/page.jsx`

**Features**:
- List of published videos
- YouTube thumbnail
- Title
- Views, likes, comments
- Link to YouTube
- Analytics chart

### 5.6 Analytics Page

**File**: `frontend/app/dashboard/v2/modules/orbix-network/analytics/page.jsx`

**Features**:
- Performance comparisons:
  - Still vs Motion backgrounds
  - Template A vs B vs C
  - Category performance
- Charts and graphs
- Date range filters

### 5.7 Settings Page

**File**: `frontend/app/dashboard/v2/modules/orbix-network/settings/page.jsx`

**Features**:
- YouTube API credentials (reconnect)
- Source management (add/edit/delete)
- Review preferences
- Publishing preferences
- Background preferences

---

## Phase 6: Module Settings Schema

### Settings Structure (stored in `module_settings` table)

```json
{
  "youtube": {
    "access_token": "encrypted",
    "refresh_token": "encrypted",
    "channel_id": "channel_id"
  },
  "review_mode": {
    "enabled": true,
    "auto_approve_minutes": 60
  },
  "publishing": {
    "youtube_visibility": "public",
    "enable_rumble": false
  },
  "scoring": {
    "shock_score_threshold": 65
  },
  "backgrounds": {
    "random_mode": "uniform"
  },
  "limits": {
    "daily_video_cap": 5
  }
}
```

---

## Phase 7: Assets

### 7.1 Background Assets

**Location**: `assets/orbix-network/backgrounds/`

**Structure**:
- `stills/` - 6 images (1-6)
- `motion/` - 6 MP4 loops (7-12)

**Upload to Supabase Storage**: `orbix-network-backgrounds/`

### 7.2 Logo/Watermark

**Location**: `assets/orbix-network/logo.png`

**Usage**: Overlay on all videos (bottom-right corner)

---

## Implementation Phases (Recommended Order)

### Phase 1: Foundation
- [ ] Database migrations (module registration + tables)
- [ ] Basic module routes structure
- [ ] Module settings schema

### Phase 2: Core Processing
- [ ] Scraping service
- [ ] Classification service
- [ ] Script generation service
- [ ] Basic API endpoints

### Phase 3: Video Pipeline
- [ ] Video renderer service
- [ ] FFmpeg integration
- [ ] Supabase Storage integration
- [ ] Render API endpoints

### Phase 4: Publishing
- [ ] YouTube API integration
- [ ] Publisher service
- [ ] Publish API endpoints

### Phase 5: Frontend - Setup
- [ ] Setup wizard
- [ ] YouTube OAuth flow
- [ ] Settings page

### Phase 6: Frontend - Dashboard
- [ ] Main dashboard
- [ ] Stories page
- [ ] Renders page
- [ ] Published videos page

### Phase 7: Background Jobs
- [ ] Scheduled scraping job
- [ ] Processing job
- [ ] Render job
- [ ] Publish job
- [ ] Analytics job

### Phase 8: Advanced Features
- [ ] Review queue UI
- [ ] Analytics page
- [ ] Performance comparisons
- [ ] Source management UI

### Phase 9: Testing & Polish
- [ ] End-to-end testing
- [ ] Error handling
- [ ] Loading states
- [ ] UI/UX polish

---

## Environment Variables Required

```env
# YouTube API
YOUTUBE_CLIENT_ID=your_client_id
YOUTUBE_CLIENT_SECRET=your_client_secret
YOUTUBE_REDIRECT_URI=https://tavarios.com/api/v2/orbix-network/youtube/callback

# Supabase Storage (for video outputs)
SUPABASE_STORAGE_BUCKET=orbix-network-videos

# OpenAI (already exists)
OPENAI_API_KEY=your_key

# FFmpeg (system path, usually auto-detected)
FFMPEG_PATH=/usr/bin/ffmpeg
```

---

## Dependencies to Add

**Backend** (`package.json`):
```json
{
  "dependencies": {
    "rss-parser": "^3.13.0",
    "cheerio": "^1.0.0-rc.12",
    "fluent-ffmpeg": "^2.1.2",
    "googleapis": "^128.0.0",
    "@supabase/supabase-js": "^2.39.0"
  }
}
```

**Note**: `@supabase/supabase-js` may already exist in the project.

---

## Key Design Decisions

1. **Multi-tenant**: All tables include `business_id` for multi-tenant isolation
2. **Status Workflows**: Clear status progression (QUEUED → APPROVED → RENDERED → PUBLISHED)
3. **Background Jobs**: Use existing `setInterval` pattern (already proven in codebase)
4. **Video Storage**: Supabase Storage (same infrastructure)
5. **Review Queue**: Optional - can be disabled for fully automated flow
6. **Error Handling**: All jobs log errors but continue processing other items

---

## Testing Strategy

1. **Unit Tests**: Services (scraper, classifier, script generator)
2. **Integration Tests**: API endpoints
3. **E2E Tests**: Full pipeline (scrape → classify → render → publish)
4. **Manual Testing**: Video quality, YouTube publishing, analytics

---

## Notes

- All functionality from original spec is preserved
- Implementation uses Node.js instead of Python (same capabilities)
- Background jobs use `setInterval` (already proven pattern)
- Video rendering uses FFmpeg (same binary, just via Node.js)
- YouTube API works identically from Node.js
- Database is shared with Tavari (better than separate)
- Admin UI is integrated (better UX than separate app)

---

**Next Steps**: Begin Phase 1 implementation (Database Schema)
