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
    const { stdout, stderr } = await execAsync(ffmpegCommand);
    
    // Clean up temp image
    await unlinkAsync(imagePath);
    
    return videoPath;
  } catch (error) {
    console.error('[Orbix Video Renderer] Error animating image:', error);
    throw error;
  }
}

/**
 * Generate text-to-speech audio for script
 * @param {Object} script - Script object
 * @returns {Promise<string>} Path to audio file
 */
async function generateAudio(script) {
  // TODO: Implement text-to-speech
  // Options:
  // 1. OpenAI TTS API
  // 2. Google Cloud Text-to-Speech
  // 3. Amazon Polly
  // 
  // For now, return placeholder
  throw new Error('Audio generation not yet implemented');
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
    
    // If MOTION type, animate the image into a video first
    let backgroundVideoPath;
    if (renderJob.background_type === 'MOTION') {
      backgroundVideoPath = await animateImageToVideo(imageUrl, script.duration_target_seconds);
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
    // This is a placeholder - actual FFmpeg command will need to be built based on template
    // Use backgroundVideoPath if available (MOTION), otherwise use imageUrl (STILL)
    const backgroundUrl = backgroundVideoPath || imageUrl;
    const ffmpegCommand = buildFFmpegCommand(backgroundUrl, audioPath, script, story, renderJob.template, outputPath);
    
    if (progressCallback) progressCallback(0.6); // 60% - Command built
    
    // Execute FFmpeg
    console.log(`[Orbix Video Renderer] Executing FFmpeg command...`);
    
    // For long-running FFmpeg, we could monitor progress, but for now we'll estimate
    // FFmpeg rendering typically takes the longest, so we'll simulate progress
    const ffmpegPromise = execAsync(ffmpegCommand);
    
    // Simulate progress during FFmpeg execution (60% -> 90%)
    const progressInterval = setInterval(() => {
      if (progressCallback) {
        // Estimate progress based on time (this is a rough estimate)
        // In a real implementation, you'd parse FFmpeg output for actual progress
        const elapsed = Date.now() - (renderJob.created_at ? new Date(renderJob.created_at).getTime() : Date.now());
        const estimatedProgress = Math.min(0.9, 0.6 + (elapsed / 60000) * 0.3); // Assume ~1 minute for rendering
        progressCallback(estimatedProgress);
      }
    }, 2000); // Update every 2 seconds
    
    const { stdout, stderr } = await ffmpegPromise;
    clearInterval(progressInterval);
    
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
  // This is a placeholder - actual FFmpeg command building will be complex
  // and depends on:
  // - Background type (still image vs video)
  // - Template type (A, B, or C)
  // - Text overlay positions and styling
  // - Watermark overlay
  // - Audio mixing
  
  // Basic structure:
  // - Input: background (image or video)
  // - Input: audio file
  // - Filters: scale to 1080x1920, text overlays, watermark
  // - Output: vertical video, 30-45 seconds, MP4
  
  // For now, return a placeholder command structure
  // Actual implementation will require FFmpeg filter_complex for text overlays
  
  throw new Error('FFmpeg command building not yet implemented - requires template definitions and text overlay configuration');
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
  } catch (error) {
    console.error(`[Orbix Video Renderer] Error updating progress for render ${renderId}:`, error);
    // Don't throw - progress updates are non-critical
  }
}

/**
 * Process a render job (select template, background, render, upload)
 * @param {Object} renderJob - Render job from database
 * @returns {Promise<Object>} Updated render job with output URL
 */
export async function processRenderJob(renderJob) {
  try {
    // Progress: 0% - Starting
    await updateRenderProgress(renderJob.id, 0);
    
    // Get story and script (10% progress)
    const { data: story } = await supabaseClient
      .from('orbix_stories')
      .select('*')
      .eq('id', renderJob.story_id)
      .single();
    
    const { data: script } = await supabaseClient
      .from('orbix_scripts')
      .select('*')
      .eq('id', renderJob.script_id)
      .single();
    
    if (!story || !script) {
      throw new Error('Story or script not found');
    }
    
    await updateRenderProgress(renderJob.id, 10);
    
    // Render video (10% -> 80% progress)
    // This is the longest step, so we'll simulate progress during rendering
    const videoPath = await renderVideo(renderJob, script, story, (progress) => {
      // Progress callback: 10% + (progress * 70%) = 10% to 80%
      const totalProgress = 10 + (progress * 0.7);
      updateRenderProgress(renderJob.id, totalProgress);
    });
    
    await updateRenderProgress(renderJob.id, 80);
    
    // Upload to storage (80% -> 95% progress)
    const outputUrl = await uploadToStorage(videoPath, renderJob.business_id, renderJob.id);
    
    await updateRenderProgress(renderJob.id, 95);
    
    // Finalize (95% -> 100%)
    await updateRenderProgress(renderJob.id, 100);
    
    return {
      outputUrl,
      status: 'COMPLETED'
    };
  } catch (error) {
    console.error('[Orbix Video Renderer] Error processing render job:', error);
    // Update progress to show failure
    await updateRenderProgress(renderJob.id, 0); // Reset on failure
    return {
      status: 'FAILED',
      error: error.message
    };
  }
}

