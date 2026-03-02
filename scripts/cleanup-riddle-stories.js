/**
 * One-time cleanup: delete all riddle stories, scripts, renders, and raw items
 * so the channel can start fresh with the corrected pipeline.
 */
import dotenv from 'dotenv';
dotenv.config();

import { supabaseClient } from '../config/database.js';

async function cleanupRiddleStories() {
  console.log('🧹 Cleaning up all riddle data...');

  // 1. Find all riddle renders via stories
  const { data: stories } = await supabaseClient
    .from('orbix_stories')
    .select('id')
    .eq('category', 'riddle');

  const storyIds = (stories || []).map(s => s.id);
  console.log(`Found ${storyIds.length} riddle stories`);

  if (storyIds.length > 0) {
    // Delete renders
    const { error: re } = await supabaseClient
      .from('orbix_renders')
      .delete()
      .in('story_id', storyIds);
    if (re) console.error('Renders delete error:', re.message);
    else console.log('✓ Deleted riddle renders');

    // Delete scripts
    const { error: se } = await supabaseClient
      .from('orbix_scripts')
      .delete()
      .in('story_id', storyIds);
    if (se) console.error('Scripts delete error:', se.message);
    else console.log('✓ Deleted riddle scripts');

    // Delete stories
    const { error: ste } = await supabaseClient
      .from('orbix_stories')
      .delete()
      .eq('category', 'riddle');
    if (ste) console.error('Stories delete error:', ste.message);
    else console.log('✓ Deleted riddle stories');
  }

  // 2. Delete all riddle raw items
  const { error: rie } = await supabaseClient
    .from('orbix_raw_items')
    .delete()
    .eq('category', 'riddle');
  if (rie) console.error('Raw items delete error:', rie.message);
  else console.log('✓ Deleted riddle raw items');

  console.log('✅ Cleanup complete. Pipeline will generate fresh riddles on next run.');
}

cleanupRiddleStories().catch(console.error);
