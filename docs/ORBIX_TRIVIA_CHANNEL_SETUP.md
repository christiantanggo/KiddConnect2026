# Orbix Trivia Channel – Setup Guide

## Overview

The Orbix Trivia Patterns channel is implemented as a separate pipeline. It includes:

- **Trivia Generator**: AI-generated trivia questions with content policy check and fingerprint deduplication
- **Separate render pipeline**: Darkening (Option A), progress bar, question/options, answer reveal
- **Music upload**: Per-channel music (same flow as backgrounds)
- **Auto-approve**: Trivia stories skip the review queue

## Database Migrations

Run these in Supabase SQL Editor (in order):

1. `migrations/add_trivia_channel_support.sql`
2. `migrations/add_orbix_music_bucket_policies.sql` (after creating the `orbix-network-music` bucket)

## Storage Setup

1. **Backgrounds**: Use existing per-channel upload. Trivia channel uses its own backgrounds; apply darkening in the trivia pipeline.
2. **Music**: Create bucket `orbix-network-music` in Supabase Dashboard (Storage → New bucket). Then run the music bucket policies migration.

## Creating a Trivia Channel

1. **Add a channel**: Create a channel named "Orbix – Trivia Patterns" (or similar) in the Orbix dashboard.
2. **Add Trivia Generator source**: Settings → Source Management → Add Source → select **Trivia Generator**. URL is auto-filled as `trivia://generator`.
3. **Upload backgrounds**: Background Preferences → Channel background images → upload your trivia background images.
4. **Upload music**: Channel music tracks → upload light tension instrumental tracks (MP3, M4A, WAV, AAC).
5. **Connect YouTube**: Connect the YouTube channel for this Orbix channel.

## Pipeline Flow

1. **Scrape job**: When a TRIVIA_GENERATOR source is scraped, the trivia generator produces one question per run.
2. **Classifier**: Trivia items are evergreen; they are auto-approved and skip review.
3. **Script**: Trivia script is built from the generator payload (no LLM call).
4. **Render**: Trivia jobs use `processTriviaRenderJob` (separate pipeline with darkening, progress bar, options, answer reveal).
5. **Upload**: Same as other channels; renders go to storage and can be published to YouTube.

## Schedule

- Trivia is included in `EVERGREEN_CATEGORIES` in the pipeline scheduler.
- Run the automated pipeline (or scrape + process + render) on your desired schedule (e.g. 6×/day every 2 hours for 6 trivia videos).

## File Reference

| File | Purpose |
|------|---------|
| `services/orbix-network/trivia-generator.js` | LLM trivia generation, policy check, fingerprint dedup |
| `services/orbix-network/trivia-renderer.js` | Trivia-specific render pipeline |
| `services/orbix-network/scraper.js` | TRIVIA_GENERATOR source handling |
| `services/orbix-network/script-generator.js` | Trivia script branch |
| `services/orbix-network/youtube-metadata.js` | Trivia title/description/hashtags |
