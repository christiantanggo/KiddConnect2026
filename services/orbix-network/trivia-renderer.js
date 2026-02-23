/**
 * Orbix Trivia Render Pipeline
 * 15s format: 0-1s hook; 1-4s question+all options; 4-7s 3s countdown (progress bar); 7-9s answer reveal; 9-15s loop trigger, hard cut.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { unlink } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomInt } from 'crypto';
import { supabaseClient } from '../../config/database.js';
import {
  getBackgroundImageUrl,
  getRandomMusicTrack,
  prepareMusicTrack,
  generateTriviaAudio,
  uploadRenderToStorage,
  applyMotionToImage,
  generateTriviaASSFile
} from './video-renderer.js';
import { buildYouTubeMetadata } from './youtube-metadata.js';
import { writeProgressLog, setCurrentRender } from '../../utils/crash-and-progress-log.js';

const execAsync = promisify(exec);
const unlinkAsync = promisify(unlink);

// Timing constants (15s total, no waiting time)
const HOOK_DURATION = 1.0;
const READ_DURATION = 3.0;       // question + options visible 1s–4s
const COUNTDOWN_DURATION = 3.0;   // 4s–7s
const REVEAL_DURATION = 2.0;      // 7s–9s
const LOOP_DURATION = 6.0;        // 9s–15s
const DURATION = 15;

/**
 * Process a trivia render job (separate pipeline from news/money/psychology).
 */
export async function processTriviaRenderJob(render, story, script) {
  const renderId = render.id;
  const businessId = render.business_id;
  const channelId = story?.channel_id ?? null;

  writeProgressLog('TRIVIA_RENDER_START', { renderId });
  setCurrentRender(renderId, 'TRIVIA_RENDER');

  const content = script?.content_json
    ? (typeof script.content_json === 'string' ? JSON.parse(script.content_json) : script.content_json)
    : {};
  const hook = (script?.hook || content?.hook || "Let's test your knowledge.").trim();
  const category = (content?.category || 'GENERAL').toString().slice(0, 30);
  const question = (content?.question || '').trim().slice(0, 150);
  const optionA = (content?.option_a || 'A').trim().slice(0, 80);
  const optionB = (content?.option_b || 'B').trim().slice(0, 80);
  const optionC = (content?.option_c || 'C').trim().slice(0, 80);
  const correctLetter = (content?.correct_answer || 'A').toUpperCase().charAt(0);
  const correctText = { A: optionA, B: optionB, C: optionC }[correctLetter] || optionA;

  const backgroundStoragePath = render.background_storage_path ?? null;
  const backgroundId = render.background_id ?? 1;

  let bgPath;
  let motionPath;
  let audioPath;
  let musicPath;
  let baseVideoPath;
  let finalVideoPath;

  try {
    // 1. Download background
    const imageUrl = await getBackgroundImageUrl(backgroundId, backgroundStoragePath);
    const axios = (await import('axios')).default;
    const fs = (await import('fs')).default;
    bgPath = join(tmpdir(), `trivia-bg-${renderId}-${Date.now()}.png`);
    const imgResp = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
    await fs.promises.writeFile(bgPath, imgResp.data);

    // 2. Apply motion to background (creates 15s video)
    motionPath = await applyMotionToImage(bgPath, DURATION);

    // Trivia number: count of trivia stories for this channel up to this story
    let triviaNumber = 1;
    if (channelId && story?.id) {
      const { count } = await supabaseClient
        .from('orbix_stories')
        .select('*', { count: 'exact', head: true })
        .eq('channel_id', channelId)
        .eq('category', 'trivia')
        .lte('created_at', story.created_at || new Date().toISOString());
      triviaNumber = Math.max(1, count ?? 1);
    }

    // Loop trigger: pick one phrase at random (correctLetter, one wrong letter)
    const wrongLetters = ['A', 'B', 'C'].filter((l) => l !== correctLetter);
    const wrongLetter = wrongLetters[randomInt(wrongLetters.length)];
    const loopPhrases = [
      `Most people pick ${wrongLetter}… that's wrong.`,
      `If you picked ${correctLetter}… you're ahead of most.`,
      'Be honest… did you change your answer?'
    ];
    const loopTriggerText = loopPhrases[randomInt(loopPhrases.length)];

    // 3. Generate ASS overlay per retention blueprint (15s timeline)
    const assFilePath = await generateTriviaASSFile(
      {
        category,
        triviaNumber,
        question,
        optionA: `A) ${optionA}`,
        optionB: `B) ${optionB}`,
        optionC: `C) ${optionC}`,
        answerText: `ANSWER: ${correctLetter}) ${correctText}`,
        correctLetter,
        loopTriggerText,
        hookText: hook
      },
      DURATION
    );

    const simpleAssPath = join(tmpdir(), `trivia-ass-${renderId}-${Date.now()}.ass`);
    await fs.promises.copyFile(assFilePath, simpleAssPath);
    const simpleAssPathEscaped = simpleAssPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");

    // 4. 40% black overlay + progress bar (FFmpeg) + ASS
    // Progress bar: 3s countdown only, 4s–7s (shrinks right→left over 3s)
    baseVideoPath = join(tmpdir(), `trivia-base-${renderId}-${Date.now()}.mp4`);
    const barY = 910;
    const barW = 900;
    const barH = 14;
    const barX = 90;
    const filterComplex = [
      `[0:v]drawbox=x=0:y=0:w=iw:h=ih:color=black@0.4:t=fill,drawbox=x=${barX}:y=${barY}:w=${barW}:h=${barH}:color=0x404040:t=fill:enable='between(t\\,4\\,7)'[v1]`,
      `color=c=white:s=${barW}x${barH}:d=${DURATION},scale=eval=frame:w='if(lt(t\\,4)\\,900\\,if(gt(t\\,7)\\,1\\,max(1\\,900*(7-t)/3)))':h=${barH}[bar]`,
      `[v1][bar]overlay=x=${barX}:y=${barY}:enable='between(t\\,4\\,7)'[v2]`,
      `[v2]ass='${simpleAssPathEscaped}'[vout]`
    ].join(';');
    await execAsync(
      `ffmpeg -i "${motionPath}" -filter_complex "${filterComplex}" -map "[vout]" -map 0:a? -c:v libx264 -preset medium -crf 23 -c:a copy -t ${DURATION} -pix_fmt yuv420p -y "${baseVideoPath}"`,
      { timeout: 120000 }
    );

    try { await unlinkAsync(assFilePath); } catch (_) {}
    try { await unlinkAsync(simpleAssPath); } catch (_) {}

    // 5. Generate trivia TTS: hook 0s, question 1s, answer 7s, loop trigger 9s (15s total)
    const audioResult = await generateTriviaAudio(
      { hook, question, answerText: correctText, loopTriggerText },
      DURATION
    );
    audioPath = audioResult.audioPath;
    const audioDuration = audioResult.duration;

    // 6. Mix voice + optional music
    const padDur = Math.max(0, DURATION - audioDuration);
    finalVideoPath = join(tmpdir(), `trivia-final-${renderId}-${Date.now()}.mp4`);

    const musicTrack = await getRandomMusicTrack(businessId, channelId);
    if (musicTrack) {
      musicPath = await prepareMusicTrack(musicTrack.url, DURATION);
    }

    if (musicPath) {
      // Voice +25% (1.5625), music -25% (0.1875 → 0.140625)
      await execAsync(
        `ffmpeg -i "${baseVideoPath}" -i "${audioPath}" -i "${musicPath}" -filter_complex "[1:a]apad=pad_dur=${padDur},volume=1.5625[voice];[2:a]volume=0.140625[music];[voice][music]amix=inputs=2:duration=first:dropout_transition=2[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -t ${DURATION} -y "${finalVideoPath}"`,
        { timeout: 60000 }
      );
    } else {
      // Voice only: +25% volume
      await execAsync(
        `ffmpeg -i "${baseVideoPath}" -i "${audioPath}" -filter_complex "[1:a]apad=pad_dur=${padDur},volume=1.5625[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -t ${DURATION} -y "${finalVideoPath}"`,
        { timeout: 60000 }
      );
    }

    // 7. Metadata
    const { title, description, hashtags } = buildYouTubeMetadata(story, script, renderId);
    await supabaseClient
      .from('orbix_renders')
      .update({
        youtube_title: title,
        youtube_description: description,
        hashtags: hashtags,
        render_step: 'TRIVIA_RENDER',
        step_progress: 100,
        step_completed_at: new Date().toISOString()
      })
      .eq('id', renderId);

    // 8. Upload to storage
    const storageUrl = await uploadRenderToStorage(businessId, renderId, finalVideoPath);
    if (!storageUrl) throw new Error('Storage upload failed');

    await supabaseClient
      .from('orbix_renders')
      .update({
        render_status: 'READY_FOR_UPLOAD',
        output_url: storageUrl,
        step_error: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', renderId);

    writeProgressLog('TRIVIA_RENDER_DONE', { renderId, url: storageUrl });
    return { status: 'RENDER_COMPLETE', outputUrl: storageUrl, renderId };
  } catch (error) {
    console.error(`[Trivia Renderer] FAILED render_id=${renderId}`, error.message);
    await supabaseClient
      .from('orbix_renders')
      .update({
        render_status: 'STEP_FAILED',
        step_error: error.message,
        updated_at: new Date().toISOString()
      })
      .eq('id', renderId);
    throw error;
  } finally {
    for (const p of [bgPath, motionPath, audioPath, musicPath, baseVideoPath, finalVideoPath].filter(Boolean)) {
      try { await unlinkAsync(p); } catch (_) {}
    }
  }
}
