# Database objects — YouTube / studio vertical (from repo migrations)

These tables are **candidates** to move or replicate into a KiddConnect-only database.  
**Shared** tables (`businesses`, `users`, `organization_*`, `module_settings`, etc.) are still required for multi-tenant auth and billing until you build a KiddConnect-only identity model.

## Kid Quiz Studio
- `kidquiz_settings`
- `kidquiz_projects`
- `kidquiz_questions`
- `kidquiz_answer_options`
- `kidquiz_renders`
- `kidquiz_publishes`

## Dad Joke Studio
- `dadjoke_studio_formats`
- `dadjoke_studio_business_formats`
- `dadjoke_studio_style_recipes`
- `dadjoke_studio_presets`
- `dadjoke_studio_assets`
- `dadjoke_studio_ideas`
- `dadjoke_studio_generated_content`
- `dadjoke_studio_rendered_outputs`
- `dadjoke_studio_publish_queue`

## Orbix Network (news → script → render → YouTube)
Core names from `create_orbix_network_tables.sql` and follow-on migrations (channels, longform, etc.):
- `orbix_channels`, `orbix_sources`, `orbix_raw_items`, `orbix_stories`
- `orbix_scripts`, `orbix_review_queue`, `orbix_renders`, `orbix_publishes`
- Plus migrations adding: `orbix_deleted_riddles`, longform tables, channel-specific columns, etc.

Run `../docs/supabase-schema-introspection.sql` section 7 on your **live** DB — production may have extra tables.

## Movie Review Studio
- `movie_review_projects`
- `movie_review_assets`
- (and any others from `add_movie_review_module.sql` / follow-ups)

## Storage buckets (see migrations)
Examples: `kidquiz-videos`, `dadjoke-studio-assets`, `dadjoke-studio-renders`, Orbix-related buckets per migration files.

## Not “YouTube-only” but coupled
- `module_settings` (JSON per `module_key`: `kidquiz`, `orbix-network`, `movie-review`, `dad-joke-studio`, …)
- `business_modules` / marketplace tables if present — module enablement

Export policies and RLS before any cutover.
