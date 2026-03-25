-- Dad Joke Studio (KiddConnect module key: dad-joke-studio)
-- End-to-end: ideas → generated content → approve → render → upload/schedule.
-- Run in Supabase SQL Editor after review.
--
-- STORAGE: run migrations/add_dad_joke_studio_storage_buckets.sql (or create buckets in Dashboard):
--   dadjoke-studio-assets   — music, images, thumbnails (source)
--   dadjoke-studio-renders  — rendered mp4 outputs
--
-- Default duration caps (seeded below; editable later via dadjoke_studio_formats / business overrides):
--   Shorts: tight caps (20–60s target/max per format)
--   Long form: story room (5–15 min max on style engine; placeholders shorter)

-- ============================================================
-- FORMAT CATALOG (built-in seed rows; per-business enable via junction)
-- ============================================================
CREATE TABLE IF NOT EXISTS dadjoke_studio_formats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  format_key VARCHAR(64) NOT NULL UNIQUE,
  content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('shorts', 'long_form')),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  built_in BOOLEAN NOT NULL DEFAULT TRUE,
  orientation VARCHAR(20) NOT NULL CHECK (orientation IN ('vertical_9_16', 'horizontal_16_9')),
  default_width INTEGER NOT NULL DEFAULT 1080,
  default_height INTEGER NOT NULL DEFAULT 1920,
  default_fps INTEGER NOT NULL DEFAULT 30,
  target_duration_sec INTEGER NOT NULL DEFAULT 30,
  max_duration_sec INTEGER NOT NULL DEFAULT 60,
  render_defaults JSONB NOT NULL DEFAULT '{}'::jsonb,
  upload_defaults JSONB NOT NULL DEFAULT '{}'::jsonb,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_djs_formats_content_type ON dadjoke_studio_formats(content_type);
CREATE INDEX IF NOT EXISTS idx_djs_formats_key ON dadjoke_studio_formats(format_key);

COMMENT ON TABLE dadjoke_studio_formats IS 'Global format definitions; duration/orientation/render/upload defaults are editable in DB for ops without code rewrites.';
COMMENT ON COLUMN dadjoke_studio_formats.render_defaults IS 'e.g. font_family, text_color, voice_enabled default, motion profile — merged at render time.';
COMMENT ON COLUMN dadjoke_studio_formats.upload_defaults IS 'e.g. default category_id, privacy, made_for_kids — hints for upload form.';

CREATE TABLE IF NOT EXISTS dadjoke_studio_business_formats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  format_id UUID NOT NULL REFERENCES dadjoke_studio_formats(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, format_id)
);

CREATE INDEX IF NOT EXISTS idx_djs_business_formats_business ON dadjoke_studio_business_formats(business_id);

-- ============================================================
-- STYLE (long-form script generator) — recipe vs preset
-- ============================================================
CREATE TABLE IF NOT EXISTS dadjoke_studio_style_recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID,
  recipe_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_djs_style_recipes_business ON dadjoke_studio_style_recipes(business_id);

CREATE TABLE IF NOT EXISTS dadjoke_studio_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  built_in BOOLEAN NOT NULL DEFAULT FALSE,
  scope VARCHAR(32) NOT NULL DEFAULT 'business' CHECK (scope IN ('global', 'business')),
  style_recipe_id UUID REFERENCES dadjoke_studio_style_recipes(id) ON DELETE SET NULL,
  recipe_embed JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_djs_presets_business ON dadjoke_studio_presets(business_id);

-- ============================================================
-- ASSETS (per-business library)
-- ============================================================
CREATE TABLE IF NOT EXISTS dadjoke_studio_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  asset_type VARCHAR(32) NOT NULL CHECK (asset_type IN ('music', 'image', 'background', 'thumbnail')),
  display_name VARCHAR(255),
  storage_path TEXT NOT NULL,
  mime_type VARCHAR(128),
  size_bytes BIGINT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_djs_assets_business ON dadjoke_studio_assets(business_id);
CREATE INDEX IF NOT EXISTS idx_djs_assets_type ON dadjoke_studio_assets(business_id, asset_type);

-- ============================================================
-- AI IDEAS / CONTENT PLANNER (separate from generated scripts)
-- ============================================================
CREATE TABLE IF NOT EXISTS dadjoke_studio_ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  prompt TEXT NOT NULL,
  mode VARCHAR(32) NOT NULL DEFAULT 'manual' CHECK (mode IN ('manual', 'auto', 'hybrid')),
  results_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  selected_index INTEGER,
  status VARCHAR(32) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'selected', 'converted', 'archived')),
  downstream_content_type VARCHAR(20) CHECK (downstream_content_type IN ('shorts', 'long_form')),
  downstream_format_key VARCHAR(64),
  generated_content_id UUID,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_djs_ideas_business ON dadjoke_studio_ideas(business_id);
CREATE INDEX IF NOT EXISTS idx_djs_ideas_created ON dadjoke_studio_ideas(created_at DESC);

-- FK added after generated_content exists (see below ALTER)

-- ============================================================
-- GENERATED CONTENT (script/storyboard + workflow)
-- ============================================================
CREATE TABLE IF NOT EXISTS dadjoke_studio_generated_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  module_key VARCHAR(64) NOT NULL DEFAULT 'dad-joke-studio',
  content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('shorts', 'long_form')),
  format_id UUID NOT NULL REFERENCES dadjoke_studio_formats(id),
  format_key VARCHAR(64) NOT NULL,
  orientation VARCHAR(20) NOT NULL,
  style_recipe_id UUID REFERENCES dadjoke_studio_style_recipes(id) ON DELETE SET NULL,
  style_recipe_snapshot JSONB,
  asset_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  script_text TEXT NOT NULL DEFAULT '',
  storyboard_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  content_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_mode VARCHAR(32) CHECK (ai_mode IN ('manual', 'auto', 'hybrid')),
  ai_prompt TEXT,
  summary TEXT,
  title TEXT,
  upload_title TEXT,
  upload_description TEXT,
  upload_tags JSONB DEFAULT '[]'::jsonb,
  status VARCHAR(40) NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
    'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'RENDERING', 'RENDERED',
    'UPLOAD_QUEUED', 'UPLOADING', 'SCHEDULED', 'PUBLISHED', 'FAILED'
  )),
  approved_at TIMESTAMPTZ,
  approved_by_user_id UUID,
  current_render_id UUID,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_djs_gc_business ON dadjoke_studio_generated_content(business_id);
CREATE INDEX IF NOT EXISTS idx_djs_gc_status ON dadjoke_studio_generated_content(business_id, status);
CREATE INDEX IF NOT EXISTS idx_djs_gc_type_format ON dadjoke_studio_generated_content(business_id, content_type, format_key);
CREATE INDEX IF NOT EXISTS idx_djs_gc_created ON dadjoke_studio_generated_content(created_at DESC);

-- ============================================================
-- RENDERED OUTPUTS
-- ============================================================
CREATE TABLE IF NOT EXISTS dadjoke_studio_rendered_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_content_id UUID NOT NULL REFERENCES dadjoke_studio_generated_content(id) ON DELETE CASCADE,
  business_id UUID NOT NULL,
  render_status VARCHAR(24) NOT NULL DEFAULT 'PENDING' CHECK (render_status IN ('PENDING', 'RENDERING', 'READY', 'FAILED')),
  output_url TEXT,
  output_storage_path TEXT,
  duration_sec NUMERIC(10,2),
  width INTEGER,
  height INTEGER,
  fps INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_djs_render_gc ON dadjoke_studio_rendered_outputs(generated_content_id);

ALTER TABLE dadjoke_studio_generated_content
  ADD CONSTRAINT fk_djs_gc_current_render
  FOREIGN KEY (current_render_id) REFERENCES dadjoke_studio_rendered_outputs(id) ON DELETE SET NULL;

ALTER TABLE dadjoke_studio_ideas
  ADD CONSTRAINT fk_djs_ideas_generated_content
  FOREIGN KEY (generated_content_id) REFERENCES dadjoke_studio_generated_content(id) ON DELETE SET NULL;

-- ============================================================
-- PUBLISH QUEUE
-- ============================================================
CREATE TABLE IF NOT EXISTS dadjoke_studio_publish_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_content_id UUID NOT NULL REFERENCES dadjoke_studio_generated_content(id) ON DELETE CASCADE,
  rendered_output_id UUID NOT NULL REFERENCES dadjoke_studio_rendered_outputs(id) ON DELETE CASCADE,
  business_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  privacy_status VARCHAR(20) NOT NULL DEFAULT 'public' CHECK (privacy_status IN ('public', 'unlisted', 'private')),
  self_declared_made_for_kids BOOLEAN NOT NULL DEFAULT FALSE,
  category_id VARCHAR(8) NOT NULL DEFAULT '23',
  thumbnail_storage_path TEXT,
  schedule_publish_at_utc TIMESTAMPTZ,
  publish_status VARCHAR(24) NOT NULL DEFAULT 'PENDING' CHECK (publish_status IN ('PENDING', 'UPLOADING', 'SCHEDULED', 'PUBLISHED', 'FAILED')),
  youtube_video_id VARCHAR(64),
  youtube_url TEXT,
  error_message TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_djs_pub_business ON dadjoke_studio_publish_queue(business_id);
CREATE INDEX IF NOT EXISTS idx_djs_pub_status ON dadjoke_studio_publish_queue(publish_status);

-- ============================================================
-- SEED BUILT-IN FORMATS
-- (Adjust caps anytime in this table — no deploy required.)
-- ============================================================
INSERT INTO dadjoke_studio_formats (
  format_key, content_type, name, description, built_in, orientation,
  default_width, default_height, default_fps, target_duration_sec, max_duration_sec,
  render_defaults, upload_defaults
) VALUES
  ('shorts_classic_loop', 'shorts', 'Classic Loop',
   'Setup, countdown feel, answer reveal, loop-friendly end.',
   TRUE, 'vertical_9_16', 1080, 1920, 30, 28, 58,
   '{"font_family":"Arial","text_color":"#ffffff","voice_enabled":true,"motion":"orbix_vertical"}'::jsonb,
   '{"default_category_id":"23","default_privacy":"public"}'::jsonb),
  ('shorts_vs', 'shorts', 'Dad Joke vs Dad Joke',
   'Joke A vs B, audience pick.',
   TRUE, 'vertical_9_16', 1080, 1920, 30, 32, 60,
   '{"font_family":"Arial","text_color":"#ffffff","voice_enabled":true,"motion":"orbix_vertical"}'::jsonb,
   '{"default_category_id":"23"}'::jsonb),
  ('shorts_guess_punchline', 'shorts', 'Guess the Punchline',
   'Setup, pause, reveal.',
   TRUE, 'vertical_9_16', 1080, 1920, 30, 24, 55,
   '{"font_family":"Arial","text_color":"#ffffff","voice_enabled":true,"motion":"orbix_vertical"}'::jsonb,
   '{"default_category_id":"23"}'::jsonb),
  ('shorts_micro_story', 'shorts', 'Micro Story Joke',
   'Tiny story, fast payoff.',
   TRUE, 'vertical_9_16', 1080, 1920, 30, 22, 50,
   '{"font_family":"Arial","text_color":"#ffffff","voice_enabled":true,"motion":"orbix_vertical"}'::jsonb,
   '{"default_category_id":"23"}'::jsonb),
  ('long_style_engine', 'long_form', 'Style Engine Script Generator',
   'Checkbox-driven style engine + long script.',
   TRUE, 'horizontal_16_9', 1920, 1080, 30, 300, 900,
   '{"font_family":"Arial","text_color":"#f8fafc","voice_enabled":true,"motion":"static_landscape"}'::jsonb,
   '{"default_category_id":"23","default_privacy":"public","is_shorts_upload":false}'::jsonb),
  ('long_battles', 'long_form', 'Dad Joke Battles',
   'Placeholder structure for future format.',
   TRUE, 'horizontal_16_9', 1920, 1080, 30, 180, 600,
   '{"font_family":"Arial","text_color":"#f8fafc","voice_enabled":true,"motion":"static_landscape"}'::jsonb,
   '{"default_category_id":"23","is_shorts_upload":false}'::jsonb),
  ('long_competitions', 'long_form', 'Dad Joke Competitions',
   'Placeholder structure for future format.',
   TRUE, 'horizontal_16_9', 1920, 1080, 30, 180, 600,
   '{"font_family":"Arial","text_color":"#f8fafc","voice_enabled":true,"motion":"static_landscape"}'::jsonb,
   '{"default_category_id":"23","is_shorts_upload":false}'::jsonb),
  ('long_compilations', 'long_form', 'Dad Joke Compilations',
   'Placeholder structure for future format.',
   TRUE, 'horizontal_16_9', 1920, 1080, 30, 240, 720,
   '{"font_family":"Arial","text_color":"#f8fafc","voice_enabled":true,"motion":"static_landscape"}'::jsonb,
   '{"default_category_id":"23","is_shorts_upload":false}'::jsonb)
ON CONFLICT (format_key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  orientation = EXCLUDED.orientation,
  default_width = EXCLUDED.default_width,
  default_height = EXCLUDED.default_height,
  default_fps = EXCLUDED.default_fps,
  target_duration_sec = EXCLUDED.target_duration_sec,
  max_duration_sec = EXCLUDED.max_duration_sec,
  render_defaults = EXCLUDED.render_defaults,
  upload_defaults = EXCLUDED.upload_defaults,
  updated_at = NOW();

-- ============================================================
-- SEED BUILT-IN PRESETS (global scope, recipe_embed JSON)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dadjoke_studio_presets WHERE name = 'Storyteller' AND built_in = TRUE) THEN
    INSERT INTO dadjoke_studio_presets (business_id, name, description, category, built_in, scope, recipe_embed, metadata)
    VALUES (NULL, 'Storyteller', 'Warm narrative + medium density', 'character', TRUE, 'global',
      '{"base":["Storytelling"],"tone":["Friendly Dad Energy"],"rhythm":["Medium Joke Density"],"topic":["Parenting Moments"],"structure":["Strong Opening One-Liner","Final Real Joke Reveal"]}'::jsonb, '{}'::jsonb);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM dadjoke_studio_presets WHERE name = 'Observational Everyday' AND built_in = TRUE) THEN
    INSERT INTO dadjoke_studio_presets (business_id, name, description, category, built_in, scope, recipe_embed, metadata)
    VALUES (NULL, 'Observational Everyday', 'Life observations, calm tone', 'character', TRUE, 'global',
      '{"base":["Observational"],"tone":["Calm"],"rhythm":["Sparse Jokes"],"topic":["Daily Life Annoyances"],"structure":["Tangent Friendly"]}'::jsonb, '{}'::jsonb);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM dadjoke_studio_presets WHERE name = 'High-Energy Rant' AND built_in = TRUE) THEN
    INSERT INTO dadjoke_studio_presets (business_id, name, description, category, built_in, scope, recipe_embed, metadata)
    VALUES (NULL, 'High-Energy Rant', 'Fast rant energy', 'character', TRUE, 'global',
      '{"base":["Rant Style","Punchy"],"tone":["Frustrated","Slightly Grumpy"],"rhythm":["Rapid Fire","Dense Jokes"],"topic":["Technology Frustration"],"structure":["Escalating Chaos"]}'::jsonb, '{}'::jsonb);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM dadjoke_studio_presets WHERE name = 'Topical Monologue' AND built_in = TRUE) THEN
    INSERT INTO dadjoke_studio_presets (business_id, name, description, category, built_in, scope, recipe_embed, metadata)
    VALUES (NULL, 'Topical Monologue', 'News-adjacent absurdity', 'character', TRUE, 'global',
      '{"base":["Topical"],"tone":["Mock Serious"],"rhythm":["Medium Joke Density"],"topic":["News / Current Events Absurdity"],"structure":["Fake Seriousness"]}'::jsonb, '{}'::jsonb);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM dadjoke_studio_presets WHERE name = 'Friendly Dad Chaos' AND built_in = TRUE) THEN
    INSERT INTO dadjoke_studio_presets (business_id, name, description, category, built_in, scope, recipe_embed, metadata)
    VALUES (NULL, 'Friendly Dad Chaos', 'Family chaos energy', 'character', TRUE, 'global',
      '{"base":["Exaggerated","Conversational"],"tone":["Silly","Friendly Dad Energy"],"rhythm":["Dense Jokes"],"topic":["Family Chaos"],"structure":["Big End Callback"]}'::jsonb, '{}'::jsonb);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM dadjoke_studio_presets WHERE name = 'Mock Serious Neighborhood Disaster' AND built_in = TRUE) THEN
    INSERT INTO dadjoke_studio_presets (business_id, name, description, category, built_in, scope, recipe_embed, metadata)
    VALUES (NULL, 'Mock Serious Neighborhood Disaster', 'Neighbor weirdness mock-doc', 'character', TRUE, 'global',
      '{"base":["Observational"],"tone":["Mock Serious","Deadpan"],"rhythm":["Long Setup / Short Payoff"],"topic":["Neighbor Weirdness"],"structure":["Fake Seriousness","Mid-Script Callback"]}'::jsonb, '{}'::jsonb);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM dadjoke_studio_presets WHERE name = 'Family Frustration' AND built_in = TRUE) THEN
    INSERT INTO dadjoke_studio_presets (business_id, name, description, category, built_in, scope, recipe_embed, metadata)
    VALUES (NULL, 'Family Frustration', 'Parenting grind + jokes', 'character', TRUE, 'global',
      '{"base":["Storytelling"],"tone":["Frustrated","Sarcastic"],"rhythm":["Medium Joke Density"],"topic":["Parenting Moments"],"structure":["Escalating Chaos"]}'::jsonb, '{}'::jsonb);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM dadjoke_studio_presets WHERE name = 'Slow Burn Callback' AND built_in = TRUE) THEN
    INSERT INTO dadjoke_studio_presets (business_id, name, description, category, built_in, scope, recipe_embed, metadata)
    VALUES (NULL, 'Slow Burn Callback', 'Slow setup, callback finish', 'character', TRUE, 'global',
      '{"base":["Slow Burn"],"tone":["Deadpan"],"rhythm":["Sparse Jokes","Callback Heavy"],"topic":["Backyard / Home Disaster"],"structure":["Mid-Script Callback","Big End Callback"]}'::jsonb, '{}'::jsonb);
  END IF;
END $$;

-- ============================================================
-- MODULE REGISTRATION
-- ============================================================
INSERT INTO modules (key, name, description, category, is_active, health_status, version, metadata, created_at, updated_at)
VALUES (
  'dad-joke-studio',
  'Dad Joke Studio',
  'Dad joke Shorts & long-form studio — ideas, scripts, render, YouTube upload/schedule.',
  'content',
  TRUE,
  'healthy',
  '1.0.0',
  '{"pricing":{"monthly_price_cents":0,"currency":"usd","usage_limit":null}}'::jsonb,
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
