/**
 * Orbix Network Render Steps
 * Step-by-step video rendering with detailed logging
 * 
 * Steps:
 * 3. Background motion render and voice addition
 * 4. Impact/hook text addition render
 * 5. Caption/subtitle addition render
 * 6. Caption and hashtag creation
 * 7. YouTube upload
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { unlink } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { supabaseClient } from '../../config/database.js';
import { 
  selectTemplate, 
  selectBackground, 
  generateAudio, 
  generateCaptionSegments, 
  generateASSSubtitleFile,
  generateHookOnlyASSFile,
  applyMotionToImage,
  getBackgroundImageUrl,
  getRandomMusicTrack,
  prepareMusicTrack
} from './video-renderer.js';

const execAsync = promisify(exec);
const unlinkAsync = promisify(unlink);

/**
 * Log a step event to the database
 */
async function logStepEvent(renderId, step, event, message, data = null) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    step,
    event,
    message,
    data
  };
  
  console.log(`[Render Step ${step}] [${event}] ${message}`, data ? JSON.stringify(data) : '');
  
  try {
    // Get current logs
    const { data: render } = await supabaseClient
      .from('orbix_renders')
      .select('step_logs')
      .eq('id', renderId)
      .single();
    
    const currentLogs = render?.step_logs || [];
    const updatedLogs = [...currentLogs, logEntry].slice(-100); // Keep last 100 logs
    
    await supabaseClient
      .from('orbix_renders')
      .update({ step_logs: updatedLogs })
      .eq('id', renderId);
  } catch (error) {
    console.error(`[Render Step ${step}] Failed to log event:`, error.message);
  }
}

/**
 * Update render step status
 */
async function updateStepStatus(renderId, step, progress, error = null) {
  const updateData = {
    render_step: step,
    step_progress: progress,
    updated_at: new Date().toISOString()
  };
  
  if (progress === 0) {
    updateData.step_started_at = new Date().toISOString();
  }
  
  if (progress === 100 || error) {
    updateData.step_completed_at = new Date().toISOString();
  }
  
  if (error) {
    updateData.step_error = error;
    updateData.render_status = 'STEP_FAILED';
  }
  
  try {
    const { error: updateError, data } = await supabaseClient
      .from('orbix_renders')
      .update(updateData)
      .eq('id', renderId)
      .select();
    
    if (updateError) {
      console.error(`[Render Step ${step}] ❌ CRITICAL: Failed to update step status in database!`);
      console.error(`[Render Step ${step}] Error:`, updateError.message);
      console.error(`[Render Step ${step}] Error details:`, JSON.stringify(updateError));
      console.error(`[Render Step ${step}] Update data:`, JSON.stringify(updateData));
      console.error(`[Render Step ${step}] Render ID:`, renderId);
      // Don't throw - allow step to continue, but log clearly
    } else {
      console.log(`[Render Step ${step}] ✅ Step status updated: ${step} at ${progress}%`);
    }
  } catch (error) {
    console.error(`[Render Step ${step}] ❌ CRITICAL: Exception updating step status:`, error.message);
    console.error(`[Render Step ${step}] Stack:`, error.stack);
    // Don't throw - allow step to continue
  }
}

/**
 * STEP 3: Background motion render
 * Creates video with background + motion (NO audio, NO text)
 * @param {number} [targetDuration] - Optional. If provided (e.g. audioDuration+2), motion and trim use this length.
 */
export async function step3Background(renderId, renderJob, script, story, targetDuration = null) {
  const step = 'STEP_3_BACKGROUND';
  await logStepEvent(renderId, step, 'START', 'Starting background motion render');
  await updateStepStatus(renderId, step, 0);
  
  try {
    // Get background image
    await logStepEvent(renderId, step, 'PROGRESS', 'Fetching background image', { background_id: renderJob.background_id });
    await updateStepStatus(renderId, step, 10);
    
    const imageUrl = await getBackgroundImageUrl(renderJob.background_id, renderJob.background_storage_path);
    await logStepEvent(renderId, step, 'PROGRESS', 'Background image URL obtained', { url: imageUrl });
    
    // Download background image
    await updateStepStatus(renderId, step, 20);
    const axios = (await import('axios')).default;
    const fs = (await import('fs')).default;
    const backgroundPath = join(tmpdir(), `orbix-bg-${renderId}-${Date.now()}.png`);
    
    try {
      const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
      await fs.promises.writeFile(backgroundPath, response.data);
      await logStepEvent(renderId, step, 'PROGRESS', 'Background image downloaded', { path: backgroundPath });
    } catch (downloadError) {
      if (downloadError.response?.status === 404) {
        await logStepEvent(renderId, step, 'ERROR', `Background image not found in storage. URL: ${imageUrl}. Please ensure background images are uploaded to Supabase Storage bucket.`, { 
          backgroundId: renderJob.background_id,
          imageUrl 
        });
        throw new Error(`Background image ${renderJob.background_id} not found in Supabase Storage. Please upload background images to the 'orbix-network-backgrounds' bucket.`);
      }
      throw downloadError;
    }
    
    const durationSeconds = targetDuration ?? script.duration_target_seconds ?? 35;
    
    // Apply motion to background
    await updateStepStatus(renderId, step, 50);
    await logStepEvent(renderId, step, 'PROGRESS', 'Applying motion to background');
    const backgroundVideoPath = await applyMotionToImage(
      backgroundPath,
      durationSeconds
    );
    await logStepEvent(renderId, step, 'PROGRESS', 'Motion applied', { path: backgroundVideoPath });
    
    // Render video: background + motion only (NO audio, NO text)
    // The motion video is already properly sized and has motion applied, so we just copy it
    await updateStepStatus(renderId, step, 70);
    await logStepEvent(renderId, step, 'PROGRESS', 'Copying motion video (motion already applied)');
    
    const step3OutputPath = join(tmpdir(), `orbix-step3-${renderId}-${Date.now()}.mp4`);
    // Just copy the motion video - it's already 1080x1920 with motion applied
    // Use -c copy to avoid re-encoding, but trim to desired duration
    const ffmpegCommand = `ffmpeg -i "${backgroundVideoPath}" -c:v copy -t ${durationSeconds} -y "${step3OutputPath}"`;
    
    await logStepEvent(renderId, step, 'COMMAND', 'FFmpeg command', { command: ffmpegCommand });
    await logStepEvent(renderId, step, 'PROGRESS', 'Executing FFmpeg command', { 
      inputVideo: backgroundVideoPath, 
      outputVideo: step3OutputPath 
    });
    
    try {
      const result = await execAsync(ffmpegCommand, { timeout: 10 * 60 * 1000 });
      await logStepEvent(renderId, step, 'PROGRESS', 'FFmpeg command executed successfully', { 
        stdout: result.stdout?.substring(0, 500),
        stderr: result.stderr?.substring(0, 500)
      });
    } catch (ffmpegError) {
      await logStepEvent(renderId, step, 'ERROR', 'FFmpeg command failed', { 
        error: ffmpegError.message,
        stdout: ffmpegError.stdout,
        stderr: ffmpegError.stderr,
        command: ffmpegCommand
      });
      throw new Error(`FFmpeg video processing failed: ${ffmpegError.message}\nCommand: ${ffmpegCommand}\nStderr: ${ffmpegError.stderr}`);
    }
    
    await updateStepStatus(renderId, step, 90);
    await logStepEvent(renderId, step, 'PROGRESS', 'Video rendered successfully', { path: step3OutputPath });
    
    // Save path to database
    await supabaseClient
      .from('orbix_renders')
      .update({ video_step3_path: step3OutputPath })
      .eq('id', renderId);
    
    await updateStepStatus(renderId, step, 100);
    await logStepEvent(renderId, step, 'COMPLETE', 'Step 3 completed successfully', { outputPath: step3OutputPath });
    
    // Cleanup
    await unlinkAsync(backgroundPath).catch(() => {});
    await unlinkAsync(backgroundVideoPath).catch(() => {});
    
    return {
      success: true,
      outputPath: step3OutputPath
    };
  } catch (error) {
    await logStepEvent(renderId, step, 'ERROR', 'Step 3 failed', { error: error.message, stack: error.stack });
    await updateStepStatus(renderId, step, 0, error.message);
    throw error;
  }
}

/**
 * STEP 4: Voice/narration and music addition
 * Adds voice narration and music to background video (NO text).
 * Output duration = audioDuration + 5 seconds (5s tail; end question + Comment Now stay on until end).
 * @param {Object} [options] - Optional. If provided: { audioPath, audioDuration, targetDuration } (pre-generated audio; do not unlink audioPath)
 */
export async function step4Voice(renderId, renderJob, script, story, step3VideoPath, options = null) {
  const step = 'STEP_4_VOICE';
  await logStepEvent(renderId, step, 'START', 'Starting voice and music addition');
  await updateStepStatus(renderId, step, 0);
  
  let audioPath;
  let audioDuration;
  const usePreGenerated = options?.audioPath != null && options?.audioDuration != null;
  
  try {
    if (usePreGenerated) {
      await updateStepStatus(renderId, step, 10);
      audioPath = options.audioPath;
      audioDuration = options.audioDuration;
      await logStepEvent(renderId, step, 'PROGRESS', 'Using pre-generated audio', { path: audioPath, duration: audioDuration });
    } else {
      // Generate audio (voice narration)
      await updateStepStatus(renderId, step, 10);
      await logStepEvent(renderId, step, 'PROGRESS', 'Generating voice audio from script');
      const audioResult = await generateAudio(script);
      audioPath = audioResult.audioPath;
      audioDuration = audioResult.duration;
      await logStepEvent(renderId, step, 'PROGRESS', 'Audio generated', { path: audioPath, duration: audioDuration });
    }
    
    const targetDuration = options?.targetDuration ?? (audioDuration + 5);
    
    // Get and prepare music track
    await updateStepStatus(renderId, step, 30);
    let musicPath = null;
    try {
      const musicTrack = await getRandomMusicTrack(renderJob.business_id);
      if (musicTrack) {
        await logStepEvent(renderId, step, 'PROGRESS', 'Music track selected', { name: musicTrack.name });
        musicPath = await prepareMusicTrack(musicTrack.url, audioDuration);
        if (musicPath) {
          await logStepEvent(renderId, step, 'PROGRESS', 'Music track prepared', { path: musicPath });
        } else {
          await logStepEvent(renderId, step, 'WARN', 'Music track preparation failed, continuing without music');
        }
      } else {
        await logStepEvent(renderId, step, 'PROGRESS', 'No music track available, continuing without music');
      }
    } catch (musicError) {
      await logStepEvent(renderId, step, 'WARN', 'Music error (non-critical)', { error: musicError.message });
      // Continue without music
    }
    
    // Render video: background video + voice + music. Output length = targetDuration (audioDuration + 2s tail).
    const padDur = Math.max(0, targetDuration - audioDuration);
    await updateStepStatus(renderId, step, 50);
    await logStepEvent(renderId, step, 'PROGRESS', 'Rendering video with voice and music');
    
    const step4OutputPath = join(tmpdir(), `orbix-step4-voice-${renderId}-${Date.now()}.mp4`);
    let ffmpegCommand;
    
    if (musicPath) {
      // Pad voice to targetDuration, then mix with music; output length = targetDuration
      ffmpegCommand = `ffmpeg -i "${step3VideoPath}" -i "${audioPath}" -i "${musicPath}" -filter_complex "[1:a]apad=pad_dur=${padDur}[v];[v][2:a]amix=inputs=2:duration=first:dropout_transition=2[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -t ${targetDuration} -pix_fmt yuv420p "${step4OutputPath}"`;
    } else {
      // Voice only: pad to targetDuration, output length = targetDuration
      ffmpegCommand = `ffmpeg -i "${step3VideoPath}" -i "${audioPath}" -filter_complex "[1:a]apad=pad_dur=${padDur}[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -t ${targetDuration} -pix_fmt yuv420p "${step4OutputPath}"`;
    }
    
    await logStepEvent(renderId, step, 'COMMAND', 'FFmpeg command', { command: ffmpegCommand });
    await logStepEvent(renderId, step, 'PROGRESS', 'Executing FFmpeg command', { 
      inputVideo: step3VideoPath, 
      audioPath: audioPath,
      musicPath: musicPath || 'none',
      outputVideo: step4OutputPath 
    });
    
    try {
      const result = await execAsync(ffmpegCommand, { timeout: 10 * 60 * 1000 });
      await logStepEvent(renderId, step, 'PROGRESS', 'FFmpeg command executed successfully', { 
        stdout: result.stdout?.substring(0, 500),
        stderr: result.stderr?.substring(0, 500)
      });
    } catch (ffmpegError) {
      await logStepEvent(renderId, step, 'ERROR', 'FFmpeg command failed', { 
        error: ffmpegError.message,
        stdout: ffmpegError.stdout,
        stderr: ffmpegError.stderr,
        command: ffmpegCommand
      });
      throw new Error(`FFmpeg audio mixing failed: ${ffmpegError.message}\nCommand: ${ffmpegCommand}\nStderr: ${ffmpegError.stderr}`);
    }
    
    await updateStepStatus(renderId, step, 90);
    await logStepEvent(renderId, step, 'PROGRESS', 'Video rendered successfully', { path: step4OutputPath });
    
    // Save path to database (using video_step4_voice_path column from migration)
    await supabaseClient
      .from('orbix_renders')
      .update({ video_step4_voice_path: step4OutputPath })
      .eq('id', renderId);
    
    await updateStepStatus(renderId, step, 100);
    await logStepEvent(renderId, step, 'COMPLETE', 'Step 4 completed successfully', { outputPath: step4OutputPath });
    
    // Cleanup (do not unlink audio if it was pre-generated; caller owns it)
    if (!usePreGenerated) {
      await unlinkAsync(audioPath).catch(() => {});
    }
    if (musicPath) {
      await unlinkAsync(musicPath).catch(() => {});
    }
    
    return {
      success: true,
      outputPath: step4OutputPath,
      audioDuration
    };
  } catch (error) {
    await logStepEvent(renderId, step, 'ERROR', 'Step 4 failed', { error: error.message, stack: error.stack });
    await updateStepStatus(renderId, step, 0, error.message);
    throw error;
  }
}

/**
 * STEP 5: Impact/hook text addition render
 * Adds hook text overlay to video from Step 4
 */
export async function step5HookText(renderId, renderJob, script, story, template, step4VideoPath, audioDuration) {
  const step = 'STEP_5_HOOK_TEXT';
  await logStepEvent(renderId, step, 'START', 'Starting hook text addition');
  await updateStepStatus(renderId, step, 0);
  
  try {
    // Get step 4 video path from database if not provided
    let inputVideoPath = step4VideoPath;
    if (!inputVideoPath) {
      const { data: render } = await supabaseClient
        .from('orbix_renders')
        .select('video_step4_voice_path')
        .eq('id', renderId)
        .single();
      
      if (!render?.video_step4_voice_path) {
        throw new Error('Step 4 video path not found in database. Step 4 must complete before Step 5.');
      }
      inputVideoPath = render.video_step4_voice_path;
      await logStepEvent(renderId, step, 'PROGRESS', 'Retrieved Step 4 video path from database', { path: inputVideoPath });
    }
    
    // Get hook text
    let hookText = script.hook;
    if (!hookText && script.content_json) {
      const content = typeof script.content_json === 'string' 
        ? JSON.parse(script.content_json) 
        : script.content_json;
      hookText = content.hook;
    }
    hookText = hookText || story.title || 'Breaking News';
    const hookDisplay = hookText.length > 80 
      ? hookText.substring(0, 77) + '...' 
      : hookText;
    const hookAllCaps = hookDisplay.toUpperCase();
    
    await logStepEvent(renderId, step, 'PROGRESS', 'Hook text extracted (all caps, wrap)', { hook: hookAllCaps });
    await updateStepStatus(renderId, step, 20);
    
    // Hook visible only while TTS is saying the hook (same duration estimate as captions)
    const hookWords = hookDisplay.split(/\s+/).filter(Boolean).length;
    const wordsPerSecond = 2.7;
    const hookDuration = Math.min(Math.max(hookWords / wordsPerSecond, 0.5), 10);
    
    // ASS: Arial Bold 114pt, center, wraps; shown only for hookDuration seconds
    const assFilePath = await generateHookOnlyASSFile(hookAllCaps, hookDuration);
    const fs = (await import('fs')).default;
    const simpleAssPath = join(tmpdir(), `hook-${renderId}-${Date.now()}.ass`);
    await fs.promises.copyFile(assFilePath, simpleAssPath);
    const simpleAssPathEscaped = simpleAssPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
    
    await updateStepStatus(renderId, step, 40);
    await logStepEvent(renderId, step, 'PROGRESS', 'Rendering hook with ASS (Arial Bold, wrap at width)');
    
    const step5OutputPath = join(tmpdir(), `orbix-step5-${renderId}-${Date.now()}.mp4`);
    const ffmpegCommand = `ffmpeg -i "${inputVideoPath}" -vf "ass='${simpleAssPathEscaped}'" -c:v libx264 -preset medium -crf 23 -c:a copy -pix_fmt yuv420p "${step5OutputPath}"`;
    
    await logStepEvent(renderId, step, 'COMMAND', 'FFmpeg command', { command: ffmpegCommand });
    await logStepEvent(renderId, step, 'PROGRESS', 'Executing FFmpeg command', {
      inputVideo: inputVideoPath,
      outputVideo: step5OutputPath
    });
    
    try {
      const result = await execAsync(ffmpegCommand, { timeout: 10 * 60 * 1000 });
      await logStepEvent(renderId, step, 'PROGRESS', 'FFmpeg command executed successfully', {
        stdout: result.stdout?.substring(0, 500),
        stderr: result.stderr?.substring(0, 500)
      });
    } catch (ffmpegError) {
      await unlinkAsync(assFilePath).catch(() => {});
      await unlinkAsync(simpleAssPath).catch(() => {});
      await logStepEvent(renderId, step, 'ERROR', 'FFmpeg command failed', {
        error: ffmpegError.message,
        stdout: ffmpegError.stdout,
        stderr: ffmpegError.stderr,
        command: ffmpegCommand
      });
      throw new Error(`FFmpeg hook text rendering failed: ${ffmpegError.message}\nCommand: ${ffmpegCommand}\nStderr: ${ffmpegError.stderr}`);
    }
    
    await unlinkAsync(assFilePath).catch(() => {});
    await unlinkAsync(simpleAssPath).catch(() => {});
    await updateStepStatus(renderId, step, 90);
    await logStepEvent(renderId, step, 'PROGRESS', 'Hook text rendered successfully', { path: step5OutputPath });
    
    // Save path to database
    await supabaseClient
      .from('orbix_renders')
      .update({ video_step4_path: step5OutputPath })
      .eq('id', renderId);
    
    await updateStepStatus(renderId, step, 100);
    await logStepEvent(renderId, step, 'COMPLETE', 'Step 5 completed successfully', { outputPath: step5OutputPath });
    
    return {
      success: true,
      outputPath: step5OutputPath
    };
  } catch (error) {
    await logStepEvent(renderId, step, 'ERROR', 'Step 5 failed', { error: error.message, stack: error.stack });
    await updateStepStatus(renderId, step, 0, error.message);
    throw error;
  }
}

/**
 * STEP 6: Caption/subtitle addition render
 * Adds captions to video from Step 5; optional end-question + "Comment Now" (hook style) from audioDuration to targetDuration
 */
export async function step6Captions(renderId, renderJob, script, story, template, step5VideoPath, audioDuration, targetDuration = null) {
  const step = 'STEP_6_CAPTIONS';
  await logStepEvent(renderId, step, 'START', 'Starting caption addition');
  await updateStepStatus(renderId, step, 0);
  
  try {
    // Get step 5 video path from database if not provided
    // Note: Step 5 saves to video_step4_path (not video_step5_path) based on migration
    let inputVideoPath = step5VideoPath;
    if (!inputVideoPath) {
      const { data: render } = await supabaseClient
        .from('orbix_renders')
        .select('video_step4_path')
        .eq('id', renderId)
        .single();
      
      if (!render?.video_step4_path) {
        throw new Error('Step 5 video path not found in database. Step 5 must complete before Step 6.');
      }
      inputVideoPath = render.video_step4_path;
      await logStepEvent(renderId, step, 'PROGRESS', 'Retrieved Step 5 video path from database', { path: inputVideoPath });
    }
    
    // Generate caption segments
    await updateStepStatus(renderId, step, 20);
    await logStepEvent(renderId, step, 'PROGRESS', 'Generating caption segments from script');
    
    const captionSegments = generateCaptionSegments(script, audioDuration);
    await logStepEvent(renderId, step, 'PROGRESS', 'Caption segments generated', { count: captionSegments.length });
    
    if (captionSegments.length === 0) {
      await logStepEvent(renderId, step, 'WARNING', 'No caption segments generated - skipping captions');
      // If no captions, just copy Step 5 video to Step 6
      const fs = (await import('fs')).default;
      const step6OutputPath = join(tmpdir(), `orbix-step6-${renderId}-${Date.now()}.mp4`);
      await fs.promises.copyFile(inputVideoPath, step6OutputPath);
      
      await supabaseClient
        .from('orbix_renders')
        .update({ video_step5_path: step6OutputPath })
        .eq('id', renderId);
      
      await updateStepStatus(renderId, step, 100);
      await logStepEvent(renderId, step, 'COMPLETE', 'Step 6 completed (no captions to add)');
      return { success: true, outputPath: step6OutputPath };
    }
    
    // Template-based positioning
    let captionY;
    switch (template) {
      case 'A': captionY = 'h-100'; break;
      case 'B': captionY = 'h-120'; break;
      case 'C': captionY = 'h-140'; break;
      default: captionY = 'h-120';
    }
    
    // Get hook text for ASS file (but captions will be separate)
    let hookText = script.hook;
    if (!hookText && script.content_json) {
      const content = typeof script.content_json === 'string' 
        ? JSON.parse(script.content_json) 
        : script.content_json;
      hookText = content.hook;
    }
    hookText = hookText || story.title || 'Breaking News';
    const hookDisplay = hookText.length > 80 
      ? hookText.substring(0, 77) + '...' 
      : hookText;
    
    // Generate ASS file with hook + captions
    await updateStepStatus(renderId, step, 40);
    await logStepEvent(renderId, step, 'PROGRESS', 'Generating ASS file with captions');
    
    let hookFontSize, hookY;
    switch (template) {
      case 'A': hookFontSize = 64; hookY = 320; break;
      case 'B': hookFontSize = 56; hookY = 340; break;
      case 'C': hookFontSize = 52; hookY = 360; break;
      default: hookFontSize = 56; hookY = 340;
    }
    
    // Hook is already burned in by step 5; step 6 ASS adds captions + end question + "Comment Now" (hook style, when spoken until end)
    const endQuestion = (script.what_happens_next || '').trim();
    const effectiveTarget = targetDuration != null && targetDuration > audioDuration ? targetDuration : audioDuration + 5;
    // When does the question start in the audio? (hook then body-without-question then question)
    const wordsPerSecond = 3.0;
    const hookWords = hookDisplay.split(/\s+/).filter(Boolean).length;
    const hookDuration = Math.min(Math.max(hookWords / wordsPerSecond, 0.5), 10);
    const bodyDuration = Math.max(audioDuration - hookDuration, 0.5);
    const bodyOnlyWords = [script.what_happened, script.why_it_matters].filter(Boolean).join(' ').split(/\s+/).filter(Boolean).length;
    const questionWords = (script.what_happens_next || '').split(/\s+/).filter(Boolean).length;
    const totalBodyWords = bodyOnlyWords + questionWords;
    const endQuestionStartSeconds = totalBodyWords > 0
      ? hookDuration + bodyDuration * (bodyOnlyWords / totalBodyWords)
      : audioDuration;
    const assFilePath = await generateASSSubtitleFile(
      captionSegments,
      captionY,
      '', // no hook in ASS - hook is from step 5
      hookFontSize,
      hookY,
      audioDuration,
      effectiveTarget,
      endQuestion || null,
      endQuestionStartSeconds
    );
    
    await logStepEvent(renderId, step, 'PROGRESS', 'ASS file generated', { path: assFilePath, segments: captionSegments.length });
    
    // Copy to simpler path
    const fs = (await import('fs')).default;
    const simpleAssPath = join(tmpdir(), `captions-${renderId}-${Date.now()}.ass`);
    await fs.promises.copyFile(assFilePath, simpleAssPath);
    // Properly escape ASS file path for FFmpeg (works on both Windows and Unix)
    // Use forward slashes; escape colon (e.g. C:) so FFmpeg doesn't treat it as option separator; escape single quotes
    const simpleAssPathEscaped = simpleAssPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
    
    // Render: Add captions to Step 5 video
    await updateStepStatus(renderId, step, 60);
    await logStepEvent(renderId, step, 'PROGRESS', 'Rendering captions overlay');
    
    const step6OutputPath = join(tmpdir(), `orbix-step6-${renderId}-${Date.now()}.mp4`);
    const ffmpegCommand = `ffmpeg -i "${inputVideoPath}" -vf "ass='${simpleAssPathEscaped}'" -c:v libx264 -preset medium -crf 23 -c:a copy -pix_fmt yuv420p "${step6OutputPath}"`;
    
    await logStepEvent(renderId, step, 'COMMAND', 'FFmpeg command', { command: ffmpegCommand });
    await logStepEvent(renderId, step, 'PROGRESS', 'Executing FFmpeg command', { 
      inputVideo: inputVideoPath, 
      assFile: simpleAssPath,
      outputVideo: step6OutputPath 
    });
    
    try {
      const result = await execAsync(ffmpegCommand, { timeout: 10 * 60 * 1000 });
      await logStepEvent(renderId, step, 'PROGRESS', 'FFmpeg command executed successfully', { 
        stdout: result.stdout?.substring(0, 500),
        stderr: result.stderr?.substring(0, 500)
      });
    } catch (ffmpegError) {
      await logStepEvent(renderId, step, 'ERROR', 'FFmpeg command failed', { 
        error: ffmpegError.message,
        stdout: ffmpegError.stdout,
        stderr: ffmpegError.stderr,
        command: ffmpegCommand
      });
      throw new Error(`FFmpeg caption rendering failed: ${ffmpegError.message}\nCommand: ${ffmpegCommand}\nStderr: ${ffmpegError.stderr}`);
    }
    
    await updateStepStatus(renderId, step, 90);
    await logStepEvent(renderId, step, 'PROGRESS', 'Captions rendered successfully', { path: step6OutputPath });
    
    // Save path to database
    await supabaseClient
      .from('orbix_renders')
      .update({ video_step5_path: step6OutputPath })
      .eq('id', renderId);
    
    await updateStepStatus(renderId, step, 100);
    await logStepEvent(renderId, step, 'COMPLETE', 'Step 6 completed successfully', { outputPath: step6OutputPath });
    
    // Cleanup
    await unlinkAsync(assFilePath).catch(() => {});
    await unlinkAsync(simpleAssPath).catch(() => {});
    
    return {
      success: true,
      outputPath: step6OutputPath
    };
  } catch (error) {
    await logStepEvent(renderId, step, 'ERROR', 'Step 6 failed', { error: error.message, stack: error.stack });
    await updateStepStatus(renderId, step, 0, error.message);
    throw error;
  }
}

/**
 * STEP 6: Caption and hashtag creation
 * Generates YouTube title, description, hashtags from story/script (psychology uses dedicated rules).
 */
export async function step7Metadata(renderId, renderJob, script, story) {
  const step = 'STEP_7_METADATA';
  await logStepEvent(renderId, step, 'START', 'Starting metadata generation');
  await updateStepStatus(renderId, step, 0);
  
  try {
    await updateStepStatus(renderId, step, 30);
    
    const { buildYouTubeMetadata } = await import('./youtube-metadata.js');
    const { title, description, hashtags } = buildYouTubeMetadata(story, script, renderId);
    
    await logStepEvent(renderId, step, 'PROGRESS', 'Metadata generated', { title, hashtags, descriptionLength: description.length });
    await updateStepStatus(renderId, step, 80);
    
    // Save to database
    await supabaseClient
      .from('orbix_renders')
      .update({
        youtube_title: title,
        youtube_description: description,
        hashtags: hashtags
      })
      .eq('id', renderId);
    
    await updateStepStatus(renderId, step, 100);
    await logStepEvent(renderId, step, 'COMPLETE', 'Step 6 completed successfully', { title, hashtags });
    
    return {
      success: true,
      title,
      description,
      hashtags
    };
  } catch (error) {
    await logStepEvent(renderId, step, 'ERROR', 'Step 6 failed', { error: error.message, stack: error.stack });
    await updateStepStatus(renderId, step, 0, error.message);
    throw error;
  }
}

/**
 * STEP 8: YouTube upload
 * Uploads final video to YouTube when a channel is connected
 */
export async function step8YouTubeUpload(renderId, renderJob, step6VideoPath) {
  const step = 'STEP_8_YOUTUBE_UPLOAD';
  console.log(`[Step 8 YouTube] START renderId=${renderId} business_id=${renderJob.business_id || 'MISSING'} step6VideoPath=${step6VideoPath ? 'set' : 'MISSING'}`);
  await logStepEvent(renderId, step, 'START', 'Starting YouTube upload');
  await updateStepStatus(renderId, step, 0);

  const { publishVideo } = await import('./youtube-publisher.js');

  try {
    // Get metadata and story (for per-channel YouTube)
    const { data: render, error: renderErr } = await supabaseClient
      .from('orbix_renders')
      .select('youtube_title, youtube_description, hashtags, script_id, story_id')
      .eq('id', renderId)
      .single();

    if (renderErr || !render) {
      console.error('[Step 8 YouTube] Render not found in DB', renderId);
      throw new Error('Render not found');
    }

    const businessId = renderJob.business_id;
    let orbixChannelId = null;
    if (render.story_id) {
      const { data: story } = await supabaseClient.from('orbix_stories').select('channel_id').eq('id', render.story_id).single();
      orbixChannelId = story?.channel_id || null;
    }
    if (!businessId) {
      console.log('[Step 8 YouTube] SKIP: no business_id on render job');
      await logStepEvent(renderId, step, 'PROGRESS', 'No business_id - skipping YouTube upload');
      await updateStepStatus(renderId, step, 100);
      return { success: true, skipped: true, message: 'No business context' };
    }

    await logStepEvent(renderId, step, 'PROGRESS', 'Metadata retrieved', { title: render.youtube_title });
    await updateStepStatus(renderId, step, 20);

    const tags = (render.hashtags || '')
      .split(/\s+/)
      .filter(t => t.startsWith('#') && t.length > 1)
      .map(t => t.replace(/^#/, ''))
      .slice(0, 15);

    const descriptionWithHashtags = (render.youtube_description || '').trim() + (render.hashtags ? '\n\n' + (render.hashtags || '').trim() : '');
    const metadata = {
      title: render.youtube_title || 'Orbix Short',
      description: descriptionWithHashtags,
      tags
    };

    const { uploadCaptions } = await import('./youtube-publisher.js');
    const publishOptions = orbixChannelId ? { orbixChannelId } : {};
    console.log(`[Step 8 YouTube] Calling publishVideo businessId=${businessId} renderId=${renderId} orbixChannelId=${orbixChannelId || 'legacy'} title="${metadata.title}"`);
    const result = await publishVideo(businessId, renderId, step6VideoPath, metadata, publishOptions);
    console.log(`[Step 8 YouTube] SUCCESS videoId=${result.videoId} url=${result.url}`);

    try {
      if (render.script_id) {
        const { data: script } = await supabaseClient.from('orbix_scripts').select('*').eq('id', render.script_id).single();
        if (script) {
          const { generateCaptionSegments, estimateAudioDurationFromScript, captionSegmentsToSrt } = await import('./video-renderer.js');
          const estimatedDuration = estimateAudioDurationFromScript(script);
          const segments = generateCaptionSegments(script, estimatedDuration);
          if (segments.length > 0) {
            const srt = captionSegmentsToSrt(segments);
            await uploadCaptions(businessId, result.videoId, srt, 'en', 'English', publishOptions);
            console.log(`[Step 8 YouTube] Captions uploaded segments=${segments.length}`);
          }
        }
      }
    } catch (captionErr) {
      console.error('[Step 8 YouTube] Caption upload failed (video already published)', captionErr?.message);
    }

    await updateStepStatus(renderId, step, 100);
    await logStepEvent(renderId, step, 'COMPLETE', 'Video published to YouTube', { url: result.url, videoId: result.videoId });

    return {
      success: true,
      skipped: false,
      url: result.url,
      videoId: result.videoId
    };
  } catch (error) {
    const isNotConnected = error?.message?.includes('YouTube not connected')
      || error?.message?.includes('connect your YouTube')
      || error?.message?.includes('credentials are missing or expired');
    console.error('[Step 8 YouTube] FAILED', {
      renderId,
      message: error.message,
      code: error.code,
      status: error.response?.status,
      responseData: error.response?.data ? JSON.stringify(error.response.data) : undefined,
      stack: error.stack
    });
    if (isNotConnected) {
      await logStepEvent(renderId, step, 'PROGRESS', 'YouTube upload skipped', { message: error.message });
      await updateStepStatus(renderId, step, 100);
      return { success: true, skipped: true, message: error.message };
    }
    await logStepEvent(renderId, step, 'ERROR', 'Step 8 failed', {
      error: error.message,
      code: error.code,
      status: error.response?.status,
      responseData: error.response?.data,
      stack: error.stack
    });
    await updateStepStatus(renderId, step, 0, error.message);
    throw error;
  }
}

