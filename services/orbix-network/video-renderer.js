/**
 * Orbix Network Video Renderer Service
 * Renders videos using FFmpeg with studio backdrops and text overlays
 * 
 * Note: Requires FFmpeg to be installed on the system
 * Background assets (6 stills + 6 motion videos) must be in Supabase Storage
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { createWriteStream, unlink } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { supabaseClient } from '../../config/database.js';
import { ModuleSettings } from '../../models/v2/ModuleSettings.js';

const execAsync = promisify(exec);
const unlinkAsync = promisify(unlink);

// Background asset configuration
// All backgrounds start as images. System will animate some to create motion videos
const TOTAL_BACKGROUNDS = 12; // 12 images total (IDs 1-12)
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET_ORBIX_BACKGROUNDS || 'orbix-network-backgrounds';
const VIDEO_DURATION = 35; // Default video duration in seconds

/**
 * Select template based on story (A, B, or C)
 * @param {Object} story - Story object
 * @returns {string} Template ID ('A', 'B', or 'C')
 */
export function selectTemplate(story) {
  // Simple selection logic - can be enhanced
  // Template A: headline + stat
  // Template B: before/after
  // Template C: impact bullets
  
  const score = story.shock_score;
  if (score >= 80) {
    return 'A'; // High impact - use headline + stat
  } else if (score >= 65) {
    return 'B'; // Medium-high - use before/after
  } else {
    return 'C'; // Medium - use impact bullets
  }
}

/**
 * Select background (still or motion, random ID)
 * At render time: 50% chance of using image as-is (STILL), 50% chance of animating it (MOTION)
 * @param {string} businessId - Business ID (for settings lookup)
 * @returns {Promise<Object>} Background selection { type: 'STILL'|'MOTION', id: number }
 */
export async function selectBackground(businessId) {
  try {
    // Get settings to check randomization mode
    const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, 'orbix-network');
    const randomMode = moduleSettings?.settings?.backgrounds?.random_mode || 'uniform';
    
    // Randomly select one of the 12 background images (1-12)
    const imageId = Math.floor(Math.random() * TOTAL_BACKGROUNDS) + 1;
    
    // 50% chance of still (use image as-is) vs motion (animate the image)
    const useStill = Math.random() < 0.5;
    
    return {
      type: useStill ? 'STILL' : 'MOTION',
      id: imageId, // Same image ID, but type determines if we animate it
      imageId: imageId // Store the source image ID
    };
  } catch (error) {
    console.error('[Orbix Video Renderer] Error selecting background:', error);
    // Default fallback
    return { type: 'STILL', id: 1, imageId: 1 };
  }
}

/**
 * Get background image URL from Supabase Storage
 * All backgrounds are stored as images, we'll animate them if needed
 * @param {number} imageId - Image ID (1-12)
 * @returns {Promise<string>} URL to background image
 */
async function getBackgroundImageUrl(imageId) {
  try {
    const filename = `Photo${imageId}.png`; // Backgrounds are PNG images (Photo1.png, Photo2.png, etc.)
    // Files are stored in root of bucket, not in a subfolder
    
    // Get public URL from Supabase Storage
    const { data } = await supabaseClient.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(filename);
    
    return data.publicUrl;
  } catch (error) {
    console.error('[Orbix Video Renderer] Error getting background image URL:', error);
    throw error;
  }
}

/**
 * Animate a still image into a motion video with zoom/parallax effect
 * Creates a temporary MP4 file from the image
 * @param {string} imageUrl - URL to the source image
 * @param {number} duration - Video duration in seconds
 * @returns {Promise<string>} Path to generated motion video file
 */
async function animateImageToVideo(imageUrl, duration = VIDEO_DURATION) {
  try {
    // Download image to temp file
    const axios = (await import('axios')).default;
    const fs = await import('fs');
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const imagePath = join(tmpdir(), `orbix-bg-${Date.now()}.jpg`);
    await fs.promises.writeFile(imagePath, response.data);
    
    // Create output video path
    const videoPath = join(tmpdir(), `orbix-motion-${Date.now()}.mp4`);
    
    // FFmpeg command to animate image with subtle zoom/parallax
    // Scale from 100% to 110% over duration (ken burns effect)
    // Output: 1080x1920 (vertical), 35 seconds, MP4
    const ffmpegCommand = `ffmpeg -loop 1 -i "${imagePath}" -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,scale=1080*1.1:1920*1.1,zoompan=z='zoom+0.001':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${duration * 30}:s=1080x1920" -t ${duration} -pix_fmt yuv420p -c:v libx264 "${videoPath}"`;
    
    console.log('[Orbix Video Renderer] Animating image to video...');
    console.log('[Orbix Video Renderer] FFmpeg command:', ffmpegCommand);
    try {
      const { stdout, stderr } = await execAsync(ffmpegCommand);
      console.log('[Orbix Video Renderer] Animation completed successfully');
    } catch (error) {
      if (error.message && (error.message.includes('not recognized') || error.message.includes('not found'))) {
        throw new Error('FFmpeg is not installed or not in your system PATH. Please install FFmpeg:\n\nWindows: Download from https://www.gyan.dev/ffmpeg/builds/ or use: choco install ffmpeg\nMac: brew install ffmpeg\nLinux: sudo apt-get install ffmpeg\n\nAfter installation, restart your development server.');
      }
      throw error;
    }
    
    // Clean up temp image
    await unlinkAsync(imagePath);
    
    return videoPath;
  } catch (error) {
    console.error('[Orbix Video Renderer] Error animating image:', error);
    throw error;
  }
}

/**
 * Generate text-to-speech audio for script using OpenAI TTS
 * @param {Object} script - Script object
 * @returns {Promise<string>} Path to audio file
 */
async function generateAudio(script) {
  try {
    const OpenAI = (await import('openai')).default;
    const fs = await import('fs');
    
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not set');
    }
    
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    // Build script text from individual fields
    // Script structure: hook, what_happened, why_it_matters, what_happens_next, cta_line
    let scriptText = '';
    
    // Check if script has the new structure (individual fields) or old structure (script_text/text)
    if (script.script_text || script.text) {
      // Old structure - use script_text or text field
      scriptText = script.script_text || script.text || '';
    } else {
      // New structure - build from individual fields
      const parts = [];
      
      if (script.hook) parts.push(script.hook);
      if (script.what_happened) parts.push(script.what_happened);
      if (script.why_it_matters) parts.push(script.why_it_matters);
      if (script.what_happens_next) parts.push(script.what_happens_next);
      if (script.cta_line) parts.push(script.cta_line);
      
      scriptText = parts.join('. ');
    }
    
    if (!scriptText || scriptText.trim().length === 0) {
      throw new Error(`Script text is empty. Script object: ${JSON.stringify(script)}`);
    }
    
    console.log(`[Orbix Video Renderer] Generating TTS audio for script (${scriptText.length} chars)...`);
    console.log(`[Orbix Video Renderer] Script preview: ${scriptText.substring(0, 100)}...`);
    
    // Generate speech using OpenAI TTS
    const mp3 = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'alloy', // Options: alloy, echo, fable, onyx, nova, shimmer
      input: scriptText,
    });
    
    // Save to temporary file
    const audioPath = join(tmpdir(), `orbix-audio-${Date.now()}.mp3`);
    const buffer = Buffer.from(await mp3.arrayBuffer());
    await fs.promises.writeFile(audioPath, buffer);
    
    console.log(`[Orbix Video Renderer] Audio generated: ${audioPath}`);
    return audioPath;
  } catch (error) {
    console.error('[Orbix Video Renderer] Error generating audio:', error);
    throw error;
  }
}

/**
 * Render video using FFmpeg
 * @param {Object} renderJob - Render job from database
 * @param {Object} script - Script object
 * @param {Object} story - Story object
 * @param {Function} progressCallback - Optional callback for progress updates (0-1)
 * @returns {Promise<string>} Path to rendered video file
 */
export async function renderVideo(renderJob, script, story, progressCallback = null) {
  try {
    console.log(`[Orbix Video Renderer] Starting render for job ${renderJob.id}`);
    
    if (progressCallback) progressCallback(0.1); // 10% - Starting
    
    // Get background image URL (all backgrounds are images)
    const imageId = renderJob.background_id; // 1-12
    const imageUrl = await getBackgroundImageUrl(imageId);
    
    if (progressCallback) progressCallback(0.2); // 20% - Background loaded
    
    // Download remote image to local file if needed
    let backgroundLocalPath = imageUrl;
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      console.log(`[Orbix Video Renderer] Downloading background image from ${imageUrl}...`);
      const axios = (await import('axios')).default;
      const fs = await import('fs');
      const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      backgroundLocalPath = join(tmpdir(), `orbix-bg-${Date.now()}.png`);
      await fs.promises.writeFile(backgroundLocalPath, response.data);
      console.log(`[Orbix Video Renderer] Background downloaded to ${backgroundLocalPath}`);
    }
    
    if (progressCallback) progressCallback(0.25); // 25% - Background downloaded
    
    // If MOTION type, animate the image into a video first
    let backgroundVideoPath;
    if (renderJob.background_type === 'MOTION') {
      backgroundVideoPath = await animateImageToVideo(backgroundLocalPath, script.duration_target_seconds || VIDEO_DURATION);
      if (progressCallback) progressCallback(0.4); // 40% - Background animated
    } else {
      // For STILL, we'll use the image directly in FFmpeg (with loop)
      backgroundVideoPath = null; // Will use image directly
      if (progressCallback) progressCallback(0.3); // 30% - Background ready
    }
    
    // Generate audio (text-to-speech)
    const audioPath = await generateAudio(script);
    if (progressCallback) progressCallback(0.5); // 50% - Audio generated
    
    // Create temporary output file
    const outputPath = join(tmpdir(), `orbix-render-${renderJob.id}-${Date.now()}.mp4`);
    
    // Build FFmpeg command
    // Use backgroundVideoPath if available (MOTION), otherwise use backgroundLocalPath (STILL)
    const backgroundUrl = backgroundVideoPath || backgroundLocalPath;
    const ffmpegCommand = buildFFmpegCommand(backgroundUrl, audioPath, script, story, renderJob.template, outputPath);
    
    if (progressCallback) progressCallback(0.6); // 60% - Command built
    
    // Execute FFmpeg with timeout and better error handling
    console.log(`[Orbix Video Renderer] Executing FFmpeg command...`);
    console.log(`[Orbix Video Renderer] FFmpeg command preview: ${ffmpegCommand.substring(0, 200)}...`);
    
    // Add timeout to prevent hanging (10 minutes max for video rendering)
    const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
    const startTime = Date.now();
    
    // For long-running FFmpeg, we could monitor progress, but for now we'll estimate
    // FFmpeg rendering typically takes the longest, so we'll simulate progress
    const ffmpegPromise = execAsync(ffmpegCommand, { timeout: TIMEOUT_MS });
    
    // Simulate progress during FFmpeg execution (60% -> 90%)
    const progressInterval = setInterval(() => {
      if (progressCallback) {
        // Estimate progress based on time (this is a rough estimate)
        // In a real implementation, you'd parse FFmpeg output for actual progress
        const elapsed = Date.now() - startTime;
        const estimatedProgress = Math.min(0.9, 0.6 + (elapsed / 60000) * 0.3); // Assume ~1 minute for rendering
        progressCallback(estimatedProgress);
        console.log(`[Orbix Video Renderer] Estimated render progress: ${(estimatedProgress * 100).toFixed(1)}% (${(elapsed / 1000).toFixed(0)}s elapsed)`);
      }
    }, 2000); // Update every 2 seconds
    
    let stdout, stderr;
    let result;
    try {
      result = await ffmpegPromise;
      clearInterval(progressInterval);
      console.log(`[Orbix Video Renderer] FFmpeg command completed successfully (took ${((Date.now() - startTime) / 1000).toFixed(0)}s)`);
    } catch (error) {
      clearInterval(progressInterval);
      console.error(`[Orbix Video Renderer] FFmpeg command failed:`, error.message);
      console.error(`[Orbix Video Renderer] FFmpeg error code:`, error.code);
      console.error(`[Orbix Video Renderer] FFmpeg stderr:`, error.stderr?.substring(0, 1000));
      
      // Provide helpful error message if FFmpeg is not installed
      if (error.message && (error.message.includes('not recognized') || error.message.includes('not found'))) {
        throw new Error('FFmpeg is not installed or not in your system PATH. Please install FFmpeg:\n\nWindows: Download from https://www.gyan.dev/ffmpeg/builds/ or use: choco install ffmpeg\nMac: brew install ffmpeg\nLinux: sudo apt-get install ffmpeg\n\nAfter installation, restart your development server.');
      }
      throw error;
    }
    
    const stdout = result.stdout;
    const stderr = result.stderr;
    
    if (progressCallback) progressCallback(0.9); // 90% - FFmpeg complete
    
    // Log FFmpeg output
    console.log(`[Orbix Video Renderer] FFmpeg stdout:`, stdout);
    if (stderr) {
      console.log(`[Orbix Video Renderer] FFmpeg stderr:`, stderr);
    }
    
    console.log(`[Orbix Video Renderer] Video rendered: ${outputPath}`);
    if (progressCallback) progressCallback(1.0); // 100% - Complete
    return outputPath;
  } catch (error) {
    console.error('[Orbix Video Renderer] Error rendering video:', error);
    throw error;
  }
}

/**
 * Build FFmpeg command for video rendering
 * @param {string} backgroundUrl - URL to background asset
 * @param {string} audioPath - Path to audio file
 * @param {Object} script - Script object
 * @param {Object} story - Story object
 * @param {string} template - Template ID ('A', 'B', or 'C')
 * @param {string} outputPath - Output file path
 * @returns {string} FFmpeg command
 */
function buildFFmpegCommand(backgroundUrl, audioPath, script, story, template, outputPath) {
  try {
    // Determine if background is a video file or image URL
    const isVideo = backgroundUrl.endsWith('.mp4') || backgroundUrl.endsWith('.mov') || backgroundUrl.startsWith('file://');
    const isLocalFile = backgroundUrl.startsWith('/') || !backgroundUrl.startsWith('http');
    
    // Get story title and key points for text overlay
    const title = story.title || 'Breaking News';
    const headline = title.length > 60 ? title.substring(0, 57) + '...' : title;
    
    // Build FFmpeg command based on template
    let videoFilter = '';
    let textOverlay = '';
    
    if (isVideo) {
      // Background is already a video (MOTION type)
      videoFilter = `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[v]`;
    } else {
      // Background is an image (STILL type) - loop it
      videoFilter = `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,loop=loop=-1:size=1:start=0[v]`;
    }
    
    // Add text overlay based on template
    // Escape special characters for FFmpeg
    const escapedHeadline = headline
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/:/g, '\\:')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]');
    
    // Use built-in font (DejaVu Sans) which is available on most systems
    // Template A: Large headline at top
    // Template B: Medium headline
    // Template C: Smaller headline
    const fontSize = template === 'A' ? 72 : template === 'B' ? 64 : 56;
    const yPos = template === 'A' ? 100 : template === 'B' ? 150 : 200;
    
    textOverlay = `drawtext=text='${escapedHeadline}':fontsize=${fontSize}:fontcolor=white:x=(w-text_w)/2:y=${yPos}:box=1:boxcolor=black@0.5:boxborderw=10`;
    
    // Build the complete FFmpeg command
    // Input 0: Background (image or video)
    // Input 1: Audio file
    let command;
    
    if (isVideo && isLocalFile) {
      // Local video file
      command = `ffmpeg -i "${backgroundUrl}" -i "${audioPath}" -filter_complex "${videoFilter};[v]${textOverlay}[vout]" -map "[vout]" -map 1:a -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 192k -shortest -pix_fmt yuv420p "${outputPath}"`;
    } else if (!isVideo && !isLocalFile) {
      // Remote image URL - need to download first (handled separately)
      // For now, assume it's been downloaded to a local path
      command = `ffmpeg -loop 1 -i "${backgroundUrl}" -i "${audioPath}" -filter_complex "${videoFilter};[v]${textOverlay}[vout]" -map "[vout]" -map 1:a -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 192k -shortest -pix_fmt yuv420p "${outputPath}"`;
    } else {
      // Local image file
      command = `ffmpeg -loop 1 -i "${backgroundUrl}" -i "${audioPath}" -filter_complex "${videoFilter};[v]${textOverlay}[vout]" -map "[vout]" -map 1:a -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 192k -shortest -pix_fmt yuv420p "${outputPath}"`;
    }
    
    console.log(`[Orbix Video Renderer] FFmpeg command: ${command.substring(0, 200)}...`);
    return command;
  } catch (error) {
    console.error('[Orbix Video Renderer] Error building FFmpeg command:', error);
    throw error;
  }
}

/**
 * Upload video to Supabase Storage
 * @param {string} videoPath - Local path to video file
 * @param {string} businessId - Business ID
 * @param {string} renderId - Render ID
 * @returns {Promise<string>} Public URL of uploaded video
 */
export async function uploadToStorage(videoPath, businessId, renderId) {
  try {
    const filename = `render-${renderId}-${Date.now()}.mp4`;
    const storagePath = `${businessId}/${filename}`;
    
    // Read file
    const fs = await import('fs');
    const videoBuffer = await fs.promises.readFile(videoPath);
    
    // Upload to Supabase Storage
    const { data, error } = await supabaseClient.storage
      .from('orbix-network-videos')
      .upload(storagePath, videoBuffer, {
        contentType: 'video/mp4',
        upsert: false
      });
    
    if (error) throw error;
    
    // Get public URL
    const { data: urlData } = await supabaseClient.storage
      .from('orbix-network-videos')
      .getPublicUrl(storagePath);
    
    // Clean up local file
    await unlinkAsync(videoPath);
    
    console.log(`[Orbix Video Renderer] Video uploaded: ${urlData.publicUrl}`);
    return urlData.publicUrl;
  } catch (error) {
    console.error('[Orbix Video Renderer] Error uploading video:', error);
    throw error;
  }
}

/**
 * Update render progress in database
 * @param {string} renderId - Render ID
 * @param {number} progress - Progress percentage (0-100)
 */
async function updateRenderProgress(renderId, progress) {
  try {
    await supabaseClient
      .from('orbix_renders')
      .update({ 
        progress_percentage: Math.max(0, Math.min(100, Math.round(progress))),
        updated_at: new Date().toISOString()
      })
      .eq('id', renderId);
    console.log(`[Orbix Video Renderer] Updated progress for render ${renderId}: ${Math.round(progress)}%`);
  } catch (error) {
    // If progress_percentage column doesn't exist, just update updated_at
    if (error.message && (error.message.includes('progress_percentage') || error.message.includes('schema cache'))) {
      console.log(`[Orbix Video Renderer] Progress column not found, skipping progress update for render ${renderId} (${Math.round(progress)}%)`);
      try {
        await supabaseClient
          .from('orbix_renders')
          .update({ 
            updated_at: new Date().toISOString()
          })
          .eq('id', renderId);
      } catch (updateError) {
        console.error(`[Orbix Video Renderer] Error updating timestamp for render ${renderId}:`, updateError.message);
      }
    } else {
      console.error(`[Orbix Video Renderer] Error updating progress for render ${renderId}:`, error.message);
    }
    // Don't throw - progress updates are non-critical
  }
}

/**
 * Process a render job (select template, background, render, upload)
 * @param {Object} renderJob - Render job from database
 * @returns {Promise<Object>} Updated render job with output URL
 */
export async function processRenderJob(renderJob) {
  console.log(`[Orbix Video Renderer] ========== PROCESS RENDER JOB START ==========`);
  console.log(`[Orbix Video Renderer] Render ID: ${renderJob.id}`);
  console.log(`[Orbix Video Renderer] Story ID: ${renderJob.story_id}`);
  console.log(`[Orbix Video Renderer] Script ID: ${renderJob.script_id}`);
  
  try {
    // Progress: 0% - Starting
    console.log(`[Orbix Video Renderer] Setting progress to 0%...`);
    await updateRenderProgress(renderJob.id, 0);
    
    // Get story and script (10% progress)
    console.log(`[Orbix Video Renderer] Fetching story ${renderJob.story_id}...`);
    const { data: story, error: storyError } = await supabaseClient
      .from('orbix_stories')
      .select('*')
      .eq('id', renderJob.story_id)
      .single();
    
    if (storyError) {
      throw new Error(`Failed to fetch story: ${storyError.message}`);
    }
    console.log(`[Orbix Video Renderer] Story fetched:`, story ? 'found' : 'not found');
    
    console.log(`[Orbix Video Renderer] Fetching script ${renderJob.script_id}...`);
    const { data: script, error: scriptError } = await supabaseClient
      .from('orbix_scripts')
      .select('*')
      .eq('id', renderJob.script_id)
      .single();
    
    if (scriptError) {
      throw new Error(`Failed to fetch script: ${scriptError.message}`);
    }
    console.log(`[Orbix Video Renderer] Script fetched:`, script ? 'found' : 'not found');
    
    if (!story || !script) {
      throw new Error('Story or script not found');
    }
    
    console.log(`[Orbix Video Renderer] Setting progress to 10%...`);
    await updateRenderProgress(renderJob.id, 10);
    
    // Render video (10% -> 80% progress)
    // This is the longest step, so we'll simulate progress during rendering
    console.log(`[Orbix Video Renderer] Starting renderVideo...`);
    const videoPath = await renderVideo(renderJob, script, story, (progress) => {
      // Progress callback: 10% + (progress * 70%) = 10% to 80%
      const totalProgress = 10 + (progress * 0.7);
      console.log(`[Orbix Video Renderer] Render progress: ${totalProgress.toFixed(1)}%`);
      updateRenderProgress(renderJob.id, totalProgress);
    });
    
    console.log(`[Orbix Video Renderer] renderVideo completed. Video path: ${videoPath}`);
    console.log(`[Orbix Video Renderer] Setting progress to 80%...`);
    await updateRenderProgress(renderJob.id, 80);
    
    // Upload to storage (80% -> 95% progress)
    console.log(`[Orbix Video Renderer] Uploading to storage...`);
    const outputUrl = await uploadToStorage(videoPath, renderJob.business_id, renderJob.id);
    console.log(`[Orbix Video Renderer] Upload completed. Output URL: ${outputUrl}`);
    
    console.log(`[Orbix Video Renderer] Setting progress to 95%...`);
    await updateRenderProgress(renderJob.id, 95);
    
    // Finalize (95% -> 100%)
    console.log(`[Orbix Video Renderer] Setting progress to 100%...`);
    await updateRenderProgress(renderJob.id, 100);
    
    console.log(`[Orbix Video Renderer] ========== PROCESS RENDER JOB SUCCESS ==========`);
    return {
      outputUrl,
      status: 'COMPLETED'
    };
  } catch (error) {
    console.error('[Orbix Video Renderer] ========== PROCESS RENDER JOB ERROR ==========');
    console.error(`[Orbix Video Renderer] Render ID: ${renderJob.id}`);
    console.error(`[Orbix Video Renderer] Error type: ${error?.constructor?.name}`);
    console.error(`[Orbix Video Renderer] Error message: ${error.message}`);
    console.error(`[Orbix Video Renderer] Error stack:`, error.stack);
    console.error(`[Orbix Video Renderer] Full error:`, error);
    
    // Update progress to show failure
    try {
      await updateRenderProgress(renderJob.id, 0); // Reset on failure
    } catch (progressError) {
      console.error(`[Orbix Video Renderer] Failed to update progress on error:`, progressError);
    }
    
    return {
      status: 'FAILED',
      error: error.message
    };
  }
}

