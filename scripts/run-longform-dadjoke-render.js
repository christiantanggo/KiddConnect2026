#!/usr/bin/env node
/**
 * Run one dad joke long-form render in a separate process.
 * Used by the API so the main server never has to load the heavy renderer.
 *
 * Usage: node scripts/run-longform-dadjoke-render.js <videoId>
 * Exit: 0 on success, 1 on failure.
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.resolve(__dirname, '..'));
dotenv.config();

const videoId = process.argv[2];
if (!videoId) {
  console.error('Usage: node scripts/run-longform-dadjoke-render.js <videoId>');
  process.exit(1);
}

async function main() {
  const { supabaseClient } = await import('../config/database.js');
  const { data: video, error: videoErr } = await supabaseClient
    .from('orbix_longform_videos')
    .select('*')
    .eq('id', videoId)
    .single();
  if (videoErr || !video) {
    console.error('Video not found:', videoId, videoErr?.message);
    process.exit(1);
  }
  const { data: dadjokeRow, error: dataErr } = await supabaseClient
    .from('orbix_longform_dadjoke_data')
    .select('script_json')
    .eq('longform_video_id', videoId)
    .maybeSingle();
  if (dataErr || !dadjokeRow) {
    console.error('No script data for video:', videoId, dataErr?.message);
    process.exit(1);
  }
  const { processDadJokeLongformRenderJob } = await import('../services/orbix-network/dadjoke-longform-renderer.js');
  const result = await processDadJokeLongformRenderJob(video, dadjokeRow);
  if (result.status === 'COMPLETED') {
    console.log('Render completed:', videoId);
    process.exit(0);
  }
  console.error('Render failed:', videoId, result.error);
  process.exit(1);
}

main().catch((err) => {
  console.error('Fatal:', err?.message || err);
  process.exit(1);
});
