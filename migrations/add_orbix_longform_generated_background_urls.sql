-- Store 5 separate generated background image URLs (one per scene: cold_open, act_1_setup, act_2_escalation, act_3_chaos, final_reset).
-- generated_background_url remains the primary image used at render time (set to act_1_setup or first available).
ALTER TABLE orbix_longform_videos
  ADD COLUMN IF NOT EXISTS generated_background_urls JSONB DEFAULT NULL;

COMMENT ON COLUMN orbix_longform_videos.generated_background_urls IS 'Object with keys cold_open, act_1_setup, act_2_escalation, act_3_chaos, final_reset → public URL strings.';
