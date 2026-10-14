-- Kid Quiz Studio: tables, module registration
-- Run in Supabase SQL Editor. Does NOT touch any existing orbix / agent tables.

-- ============================================================
-- SETTINGS (one row per business)
-- ============================================================
CREATE TABLE IF NOT EXISTS kidquiz_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  timer_seconds INTEGER NOT NULL DEFAULT 6,
  enable_auto_correct BOOLEAN NOT NULL DEFAULT TRUE,
  enable_auto_metadata BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(business_id)
);

CREATE INDEX IF NOT EXISTS idx_kidquiz_settings_business ON kidquiz_settings(business_id);

-- ============================================================
-- PROJECTS (one Short video = one project)
-- ============================================================
CREATE TABLE IF NOT EXISTS kidquiz_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  topic VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL DEFAULT 'general',
  hook_text TEXT,
  generated_title TEXT,
  generated_description TEXT,
  generated_hashtags JSONB DEFAULT '[]'::jsonb,
  privacy VARCHAR(20) NOT NULL DEFAULT 'PUBLIC' CHECK (privacy IN ('PUBLIC','UNLISTED','PRIVATE')),
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','RENDERING','READY','UPLOADING','PUBLISHED','FAILED')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kidquiz_projects_business ON kidquiz_projects(business_id);
CREATE INDEX IF NOT EXISTS idx_kidquiz_projects_status ON kidquiz_projects(status);
CREATE INDEX IF NOT EXISTS idx_kidquiz_projects_created ON kidquiz_projects(created_at DESC);

-- ============================================================
-- QUESTIONS (Shorts = exactly 1 per project)
-- ============================================================
CREATE TABLE IF NOT EXISTS kidquiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES kidquiz_projects(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0,
  question_text TEXT NOT NULL,
  timer_seconds INTEGER NOT NULL DEFAULT 6,
  explanation_text TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kidquiz_questions_project ON kidquiz_questions(project_id);

-- ============================================================
-- ANSWER OPTIONS (A / B / C per question)
-- ============================================================
CREATE TABLE IF NOT EXISTS kidquiz_answer_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES kidquiz_questions(id) ON DELETE CASCADE,
  label CHAR(1) NOT NULL CHECK (label IN ('A','B','C')),
  answer_text TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kidquiz_answers_question ON kidquiz_answer_options(question_id);

-- ============================================================
-- RENDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS kidquiz_renders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES kidquiz_projects(id) ON DELETE CASCADE,
  business_id UUID NOT NULL,
  render_status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
    CHECK (render_status IN ('PENDING','RENDERING','READY_FOR_UPLOAD','FAILED')),
  output_url TEXT,
  step_error TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kidquiz_renders_project ON kidquiz_renders(project_id);
CREATE INDEX IF NOT EXISTS idx_kidquiz_renders_status ON kidquiz_renders(render_status);

-- ============================================================
-- PUBLISHES
-- ============================================================
CREATE TABLE IF NOT EXISTS kidquiz_publishes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES kidquiz_projects(id) ON DELETE CASCADE,
  render_id UUID NOT NULL REFERENCES kidquiz_renders(id) ON DELETE CASCADE,
  business_id UUID NOT NULL,
  youtube_video_id VARCHAR(100),
  youtube_url TEXT,
  publish_status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
    CHECK (publish_status IN ('PENDING','UPLOADING','PUBLISHED','FAILED')),
  error_message TEXT,
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kidquiz_publishes_project ON kidquiz_publishes(project_id);

-- ============================================================
-- MODULE REGISTRATION (shows up in sidebar + dashboard card)
-- ============================================================
INSERT INTO modules (key, name, description, category, is_active, health_status, version, metadata, created_at, updated_at)
VALUES (
  'kidquiz',
  'Kid Quiz Studio',
  'Kid-friendly quiz video builder — create Shorts, render, and upload to YouTube automatically',
  'content',
  TRUE,
  'healthy',
  '1.0.0',
  '{}'::jsonb,
  NOW(),
  NOW()
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  is_active = EXCLUDED.is_active,
  health_status = EXCLUDED.health_status,
  version = EXCLUDED.version,
  updated_at = NOW();
