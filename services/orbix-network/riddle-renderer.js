/**
 * Orbix Riddle Render Pipeline
 *
 * Format (per original spec):
 *   0–Xs:      Riddle text on screen (viewer reads and thinks)
 *   Xs–(X+3)s: 3-2-1 countdown timer (exactly 3 seconds)
 *   (X+3)s–(X+3.5)s: Answer flash for 0.5 seconds
 *   Hard cut / loop-friendly ending
 *
 * Total duration: riddle display + 3s countdown + 0.5s answer + 0.5s loop line = ~7–10s
 * We use 9s total: 5s riddle + 3s countdown + 0.5s answer + 0.5s loop
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { unlink } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomInt } from 'crypto';
import { supabaseClient } from '../../config/database.js';
import { ffmpegPath } from './ffmpeg-path.js';
import {
  getBackgroundImageUrl,
  prepareMusicTrack,
  getRandomMusicTrack,
  generateTriviaAudio,
  uploadRenderToStorage,
  applyMotionToImage
} from './video-renderer.js';
import { buildYouTubeMetadata } from './youtube-metadata.js';
import { writeProgressLog, setCurrentRender } from '../../utils/crash-and-progress-log.js';
import { ModuleSettings } from '../../models/v2/ModuleSettings.js';

const execAsync = promisify(exec);
const unlinkAsync = promisify(unlink);

// Timing (9s total)
const RIDDLE_START  = 0;    // riddle text appears immediately
const RIDDLE_END    = 5.0;  // riddle visible for 5s
const COUNTDOWN_END = 8.0;  // 3-2-1 countdown: 5s → 8s (exactly 3 seconds)
const ANSWER_END    = 8.5;  // answer flash: 8s → 8.5s (exactly 0.5 seconds)
const LOOP_END      = 9.0;  // loop line: 8.5s → 9s then hard cut
const DURATION      = 9;

const RIDDLE_LOOP_LINES = [
  'Did you get it?',
  'Think again…',
  'Most people miss this one.',
  'Tricky, right?',
  "Don't overthink it.",
  'Watch it one more time.',
  'And that was just the warm-up…',
  'Next riddle is harder…'
];

/**
 * Generate ASS subtitle file for the riddle layout (1080x1920).
 *
 * Layout (like trivia: question stays on during countdown):
 *   Top 2/3: Riddle text (0–8s) — stays visible through countdown
 *   Lower third: 3-2-1 countdown (5–8s, progress bar + digit)
 *   8–8.5s: Answer flash (large yellow text, centered)
 *   8.5–9s: Loop trigger line, hard cut
 */
async function generateRiddleASSFile(opts) {
  const fs = (await import('fs')).default;
  const assPath = join(tmpdir(), `orbix-riddle-${Date.now()}.ass`);
  const esc = (s) => (s || '').toString()
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}');

  const t = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    const cs = Math.round((s - Math.floor(s)) * 100);
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  };

  const riddleText = (opts.riddleText || '').trim().toUpperCase();
  const answerDisplay = `ANSWER: ${(opts.answerText || '').toUpperCase()}`;
  const loopLine = (opts.loopTriggerText || 'Did you get it?').trim().toUpperCase();

  // Font sizing based on riddle length
  const wordCount = (opts.riddleText || '').split(/\s+/).length;
  let riddleFontSize;
  if (wordCount <= 8)       riddleFontSize = 96;
  else if (wordCount <= 12) riddleFontSize = 84;
  else if (wordCount <= 18) riddleFontSize = 72;
  else                      riddleFontSize = 62;

  // Word wrap — escape each line individually then join with \N (ASS newline tag)
  const wrapText = (text, maxChars) => {
    const words = (text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? cur + ' ' + w : w;
      if (next.length <= maxChars) { cur = next; }
      else { if (cur) lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    return lines.map(l => esc(l)).join('\\N');
  };

  const charsPerLine = Math.floor(820 / (riddleFontSize * 0.55));
  const wrappedRiddle = wrapText(riddleText, charsPerLine);

  // Top 2/3 = 0–1280px (center y=640). Riddle centered in that zone.
  const RIDDLE_CENTER_Y = 640;

  // Lower third = 1280–1920px. Progress bar and countdown digit go here.
  const PROGRESS_W = 900;
  const PROGRESS_H = 14;
  const PROGRESS_X = (1080 - PROGRESS_W) / 2;
  const PROGRESS_Y = 1600; // center of lower third
  const pbTop = PROGRESS_Y - Math.round(PROGRESS_H / 2);
  const COUNTDOWN_NUM_Y = PROGRESS_Y - 70;

  // Countdown: 3 digits over 3 seconds (5→6s = 3, 6→7s = 2, 7→8s = 1)
  const countdownSegments = [
    { digit: '3', start: RIDDLE_END,       end: RIDDLE_END + 1.0 },
    { digit: '2', start: RIDDLE_END + 1.0, end: RIDDLE_END + 2.0 },
    { digit: '1', start: RIDDLE_END + 2.0, end: COUNTDOWN_END    }
  ];

  // Progress bar fill keyframes (full → empty over 3s)
  const progressKeyframes = [
    { start: RIDDLE_END,       end: RIDDLE_END + 1.0, fillW: PROGRESS_W },
    { start: RIDDLE_END + 1.0, end: RIDDLE_END + 2.0, fillW: Math.round(PROGRESS_W * 2 / 3) },
    { start: RIDDLE_END + 2.0, end: COUNTDOWN_END,    fillW: Math.round(PROGRESS_W * 1 / 3) }
  ];

  const assContent = `[Script Info]
Title: Orbix Riddle
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Riddle,Arial,${riddleFontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,2,0,1,4,2,5,60,60,10,1
Style: ProgressBg,Arial,12,&H44FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: ProgressFill,Arial,12,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: CountdownNum,Arial,130,&H00FFFF00,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,5,3,5,80,80,10,1
Style: Answer,Arial,${riddleFontSize + 10},&H00FFFF00,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,5,3,5,80,80,10,1
Style: LoopTrigger,Arial,68,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,3,1,5,60,60,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const lines = [];

  // Riddle text (0 → 8s) — stays on screen during countdown, like trivia question
  // Centered in top 2/3 of screen (y=640)
  lines.push(`Dialogue: 0,${t(RIDDLE_START)},${t(COUNTDOWN_END)},Riddle,,0,0,0,,{\\an5\\pos(540,${RIDDLE_CENTER_Y})}${wrappedRiddle}`);

  // Progress bar background (5 → 8s)
  lines.push(`Dialogue: 1,${t(RIDDLE_END)},${t(COUNTDOWN_END)},ProgressBg,,0,0,0,,{\\an7\\pos(${PROGRESS_X},${pbTop})\\p1}m 0 0 l ${PROGRESS_W} 0 l ${PROGRESS_W} ${PROGRESS_H} l 0 ${PROGRESS_H}{\\p0}`);

  // Progress bar fill keyframes
  for (const kf of progressKeyframes) {
    lines.push(`Dialogue: 2,${t(kf.start)},${t(kf.end)},ProgressFill,,0,0,0,,{\\an7\\pos(${PROGRESS_X},${pbTop})\\p1}m 0 0 l ${kf.fillW} 0 l ${kf.fillW} ${PROGRESS_H} l 0 ${PROGRESS_H}{\\p0}`);
  }

  // Countdown digits
  for (const seg of countdownSegments) {
    lines.push(`Dialogue: 3,${t(seg.start)},${t(seg.end)},CountdownNum,,0,0,0,,{\\an5\\pos(540,${COUNTDOWN_NUM_Y})}${seg.digit}`);
  }

  // Answer flash (8 → 8.5s)
  lines.push(`Dialogue: 4,${t(COUNTDOWN_END)},${t(ANSWER_END)},Answer,,0,0,0,,{\\an5\\pos(540,960)}${esc(answerDisplay)}`);

  // Loop trigger (8.5 → 9s)
  lines.push(`Dialogue: 0,${t(ANSWER_END)},${t(LOOP_END)},LoopTrigger,,0,0,0,,{\\an5\\pos(540,960)}${esc(loopLine)}`);

  await fs.promises.writeFile(assPath, assContent + lines.join('\n') + '\n', 'utf8');
  return assPath;
}

/**
 * Process a riddle render job.
 */
export async function processRiddleRenderJob(render, story, script) {
  const renderId = render.id;
  const businessId = render.business_id;
  const channelId = story?.channel_id ?? null;

  const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, 'orbix-network').catch(() => null);
  const ENABLE_INTRO_HOOK = moduleSettings?.settings?.enable_intro_hook === true;

  writeProgressLog('RIDDLE_RENDER_START', { renderId });
  setCurrentRender(renderId, 'RIDDLE_RENDER');

  const content = script?.content_json
    ? (typeof script.content_json === 'string' ? JSON.parse(script.content_json) : script.content_json)
    : {};

  let riddleText = (content?.riddle_text || '').trim().slice(0, 250);
  let answerText = (content?.answer_text || '').trim().slice(0, 60);

  // Fallback: script may have been created/rewritten without content_json (e.g. latest script on restart). Load from raw item so we never lose the riddle.
  if ((!riddleText || !answerText) && story?.raw_item_id) {
    const { data: rawItem } = await supabaseClient
      .from('orbix_raw_items')
      .select('snippet')
      .eq('id', story.raw_item_id)
      .single();
    if (rawItem?.snippet) {
      try {
        const snippet = typeof rawItem.snippet === 'string' ? JSON.parse(rawItem.snippet) : rawItem.snippet;
        if (!riddleText && snippet.riddle_text) riddleText = (snippet.riddle_text || '').trim().slice(0, 250);
        if (!answerText && snippet.answer_text) answerText = (snippet.answer_text || '').trim().slice(0, 60);
      } catch (_) { /* non-fatal */ }
    }
  }

  const hook = (script?.hook || content?.hook || 'Can you solve this?').trim();

  if (!riddleText || !answerText) {
    throw new Error(`Riddle render missing content: riddle_text="${riddleText}" answer_text="${answerText}"`);
  }

  const backgroundStoragePath = render.background_storage_path ?? null;
  const backgroundId = render.background_id ?? 1;

  let bgPath, motionPath, audioPath, musicPath, baseVideoPath, finalVideoPath, assFilePath, simpleAssPath;

  try {
    // 1. Download background
    const imageUrl = await getBackgroundImageUrl(backgroundId, backgroundStoragePath);
    const axios = (await import('axios')).default;
    const fs = (await import('fs')).default;
    bgPath = join(tmpdir(), `riddle-bg-${renderId}-${Date.now()}.png`);
    const imgResp = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
    await fs.promises.writeFile(bgPath, imgResp.data);

    // 2. Apply motion (9s)
    motionPath = await applyMotionToImage(bgPath, DURATION);

    const loopTriggerText = RIDDLE_LOOP_LINES[randomInt(RIDDLE_LOOP_LINES.length)];

    // 3. Generate ASS overlay
    assFilePath = await generateRiddleASSFile({ riddleText, answerText, loopTriggerText });
    simpleAssPath = join(tmpdir(), `riddle-ass-${renderId}-${Date.now()}.ass`);
    await fs.promises.copyFile(assFilePath, simpleAssPath);
    const escapedAssPath = simpleAssPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");

    // 4. Black overlay + ASS burn
    baseVideoPath = join(tmpdir(), `riddle-base-${renderId}-${Date.now()}.mp4`);
    const filterComplex = [
      `[0:v]drawbox=x=0:y=0:w=iw:h=ih:color=black@0.45:t=fill[v1]`,
      `[v1]ass='${escapedAssPath}'[vout]`
    ].join(';');
    await execAsync(
      `"${ffmpegPath}" -i "${motionPath}" -filter_complex "${filterComplex}" -map "[vout]" -map 0:a? -c:v libx264 -preset medium -crf 23 -c:a copy -t ${DURATION} -pix_fmt yuv420p -y "${baseVideoPath}"`,
      { timeout: 120000 }
    );

    try { await unlinkAsync(assFilePath); } catch (_) {}
    try { await unlinkAsync(simpleAssPath); } catch (_) {}

    // 5. TTS audio — hook (optional) + riddle text spoken slowly + answer reveal
    const audioResult = await generateTriviaAudio(
      {
        hook: ENABLE_INTRO_HOOK ? hook : null,
        question: riddleText,
        answerText: `The answer is... ${answerText}.`,
        enableIntroHook: ENABLE_INTRO_HOOK
      },
      DURATION
    );
    audioPath = audioResult.audioPath;
    const audioDuration = audioResult.duration;

    // 6. Mix voice + optional music
    const padDur = Math.max(0, DURATION - audioDuration);
    finalVideoPath = join(tmpdir(), `riddle-final-${renderId}-${Date.now()}.mp4`);

    const musicTrack = await getRandomMusicTrack(businessId, channelId);
    if (musicTrack) {
      musicPath = await prepareMusicTrack(musicTrack.url, DURATION);
    }

    if (musicPath) {
      await execAsync(
        `"${ffmpegPath}" -i "${baseVideoPath}" -i "${audioPath}" -i "${musicPath}" -filter_complex "[1:a]apad=pad_len=${Math.round(padDur * 24000)},volume=1.5625[voice];[2:a]volume=0.140625[music];[voice][music]amix=inputs=2:duration=first:dropout_transition=2[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -t ${DURATION} -y "${finalVideoPath}"`,
        { timeout: 60000 }
      );
    } else {
      await execAsync(
        `"${ffmpegPath}" -i "${baseVideoPath}" -i "${audioPath}" -filter_complex "[1:a]apad=pad_len=${Math.round(padDur * 24000)},volume=1.5625[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -t ${DURATION} -y "${finalVideoPath}"`,
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
        hashtags,
        render_step: 'RIDDLE_RENDER',
        step_progress: 100,
        step_completed_at: new Date().toISOString()
      })
      .eq('id', renderId);

    // 8. Upload
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

    writeProgressLog('RIDDLE_RENDER_DONE', { renderId, url: storageUrl });
    return { status: 'RENDER_COMPLETE', outputUrl: storageUrl, renderId };

  } catch (error) {
    console.error(`[Riddle Renderer] FAILED render_id=${renderId}`, error.message);
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
    for (const p of [bgPath, motionPath, audioPath, musicPath, baseVideoPath, finalVideoPath, assFilePath, simpleAssPath].filter(Boolean)) {
      try { await unlinkAsync(p); } catch (_) {}
    }
  }
}
