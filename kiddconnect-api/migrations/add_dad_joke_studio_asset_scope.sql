-- Dad Joke Studio: asset usage scope (global / shorts / long_form / specific formats)
-- Run after add_dad_joke_studio_module.sql

ALTER TABLE dadjoke_studio_assets
  ADD COLUMN IF NOT EXISTS usage_scope VARCHAR(32) NOT NULL DEFAULT 'global'
    CHECK (usage_scope IN ('global', 'shorts', 'long_form', 'formats'));

ALTER TABLE dadjoke_studio_assets
  ADD COLUMN IF NOT EXISTS format_keys JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN dadjoke_studio_assets.usage_scope IS 'global = any Dad Joke Studio video; shorts/long_form = that content type only; formats = only format_keys listed';
COMMENT ON COLUMN dadjoke_studio_assets.format_keys IS 'When usage_scope = formats, non-empty array of dadjoke_studio_formats.format_key values';
