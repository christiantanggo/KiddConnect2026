/**
 * Orbix Riddle Render Pipeline
 * 11s format:
 *   0–1s:   hook line (when enabled)
 *   1–5s:   riddle text displayed (viewer thinks)
 *   5–9s:   animated 3-2-1 countdown progress bar
 *   9–9.5s: answer flash (large yellow text)
 *   9.5–11s: loop trigger line, hard cut
 *
 * Mirrors trivia-renderer.js — same timing, same pipeline.
 * Difference: no multiple-choice options; just riddle text + single answer reveal.
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
  applyMotionToImage
} from './video-renderer.js';
import { buildYouTubeMetadata } from './youtube-metadata.js';
import { writeProgressLog, setCurrentRender } from '../../utils/crash-and-progress-log.js';
import { ModuleSettings } from '../../models/v2/ModuleSettings.js';

const execAsync = promisify(exec);
const unlinkAsync = promisify(unlink);

// Timing constants (11s total — same as trivia)
const DURATION = 11;

// ASS timing
const HOOK_END = 1.0;       // hook 0–1s
const RIDDLE_END = 5.0;     // riddle text 1–5s (viewer thinking window)
const COUNTDOWN_END = 9.0;  // countdown 5–9s
const ANSWER_END = 9.5;     // answer flash 9–9.5s
const LOOP_END = 11.0;      // loop trigger 9.5–11s

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
 * Generate an ASS subtitle file for the riddle player layout (1080x1920).
 * Layout: hook (0-1s) → riddle text (1-5s) → 3-2-1 countdown (5-9s) → answer flash (9-9.5s) → loop line (9.5-11s).
 */
async function generateRiddleASSFile(opts, duration = 11) {
  const fs = (await import('fs')).default;
  const assPath = join(tmpdir(), `orbix-riddle-${Date.now()}.ass`);
  const esc = (s) => (s || '').toString().replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');

  const enableIntroHook = opts.enableIntroHook !== false && !!opts.hookText;
  const hookStart = 0;
  const contentStart = enableIntroHook ? HOOK_END : 0;

  const hookDisplay = (opts.hookText || 'Can you solve this?').trim().slice(0, 60);
  const riddleDisplay = (opts.riddleText || '').trim().toUpperCase();
  const answerDisplay = `ANSWER: ${(opts.answerText || '').toUpperCase()}`;
  const categoryDisplay = (opts.category || 'RIDDLE').toUpperCase();
  const riddleNum = opts.riddleNumber ?? 1;
  const bannerText = `${categoryDisplay}  #${riddleNum}`;
  const loopLine = (opts.loopTriggerText || 'Did you get it?').trim().slice(0, 80);

  const t = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    const cs = Math.round((s - Math.floor(s)) * 100);
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  };

  // Font sizing — scale riddle text with length
  const riddleWordCount = (opts.riddleText || '').split(/\s+/).length;
  let riddleFontSize;
  if (riddleWordCount <= 10) riddleFontSize = 88;
  else if (riddleWordCount <= 16) riddleFontSize = 76;
  else if (riddleWordCount <= 22) riddleFontSize = 66;
  else riddleFontSize = 58;

  // Text wrapping helper
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
    return lines.join('\\N');
  };

  const charsPerLine = Math.floor(756 / (riddleFontSize * 0.55));
  const wrappedRiddle = wrapText(riddleDisplay, charsPerLine);
  const riddleLineCount = wrappedRiddle.split('\\N').length;

  // Layout zones (1080x1920)
  const BANNER_H = 70;
  const Q_LINE_H = Math.round(riddleFontSize * 1.35);
  const GAP = 60;

  const riddleBlockH = riddleLineCount * Q_LINE_H;
  const progressBlockH = 100;

  const TOTAL_CONTENT_H = BANNER_H + GAP + riddleBlockH + GAP + progressBlockH;
  const TOP_MARGIN = Math.max(80, Math.round((1920 - TOTAL_CONTENT_H) / 2));

  const BANNER_Y = TOP_MARGIN;
  const RIDDLE_Y = BANNER_Y + BANNER_H + GAP;
  const PROGRESS_Y = RIDDLE_Y + riddleBlockH + GAP + progressBlockH / 2;

  const PROGRESS_H = 12;
  const PROGRESS_W = 900;
  const PROGRESS_X = (1080 - PROGRESS_W) / 2;
  const COUNTDOWN_Y = PROGRESS_Y - 55;

  // Countdown: 3s animation from contentStart (after riddle) to COUNTDOWN_END
  const countdownStart = RIDDLE_END;
  const countdownTotalSec = COUNTDOWN_END - countdownStart; // 4s
  const segDur = countdownTotalSec / 4; // ~1s per digit segment + partial

  const assContent = `[Script Info]
Title: Orbix Riddle
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Hook,Arial,100,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,3,1,5,80,80,10,1
Style: Banner,Arial,40,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,2,0,5,20,20,10,1
Style: BannerBg,Arial,12,&H00FF8000,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: Riddle,Arial,${riddleFontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,3,1,5,60,60,10,1
Style: ProgressBg,Arial,12,&H33FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: ProgressFill,Arial,12,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: CountdownNum,Arial,120,&H00FFFF00,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,4,2,5,80,80,10,1
Style: AnswerBig,Arial,${riddleFontSize + 8},&H00FFFF00,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,4,2,5,80,80,10,1
Style: LoopTrigger,Arial,72,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,3,1,5,60,60,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const lines = [];

  // Hook (0–1s)
  if (enableIntroHook) {
    lines.push(`Dialogue: 0,${t(hookStart)},${t(HOOK_END)},Hook,,0,0,0,,{\\an5\\pos(540,960)}${esc(hookDisplay.toUpperCase())}`);
  }

  // Category banner (contentStart → countdown end)
  const pbTop = PROGRESS_Y - Math.round(PROGRESS_H / 2);
  lines.push(`Dialogue: 1,${t(contentStart)},${t(COUNTDOWN_END)},BannerBg,,0,0,0,,{\\an7\\pos(0,${BANNER_Y})\\p1}m 0 0 l 1080 0 l 1080 ${BANNER_H} l 0 ${BANNER_H}{\\p0}`);
  lines.push(`Dialogue: 1,${t(contentStart)},${t(COUNTDOWN_END)},Banner,,0,0,0,,{\\an5\\pos(540,${BANNER_Y + Math.round(BANNER_H / 2)})}${esc(bannerText)}`);

  // Riddle text (contentStart → RIDDLE_END)
  const riddle_text_end = RIDDLE_END;
  lines.push(`Dialogue: 0,${t(contentStart)},${t(riddle_text_end)},Riddle,,0,0,0,,{\\an5\\pos(540,${RIDDLE_Y + riddleBlockH / 2})}${esc(wrappedRiddle)}`);

  // Progress bar background (RIDDLE_END → COUNTDOWN_END)
  lines.push(`Dialogue: 2,${t(RIDDLE_END)},${t(COUNTDOWN_END)},ProgressBg,,0,0,0,,{\\an7\\pos(${PROGRESS_X},${pbTop})\\p1}m 0 0 l ${PROGRESS_W} 0 l ${PROGRESS_W} ${PROGRESS_H} l 0 ${PROGRESS_H}{\\p0}`);

  // Animated fill — 4 keyframe segments (smooth countdown)
  for (let i = 0; i <= 4; i++) {
    const segStart = RIDDLE_END + i * segDur;
    const segEnd = RIDDLE_END + (i + 1) * segDur;
    const fillPct = (4 - i) / 4;
    const fillW = Math.max(1, Math.round(PROGRESS_W * fillPct));
    if (segStart < COUNTDOWN_END) {
      lines.push(`Dialogue: 3,${t(segStart)},${t(Math.min(segEnd, COUNTDOWN_END))},ProgressFill,,0,0,0,,{\\an7\\pos(${PROGRESS_X},${pbTop})\\p1}m 0 0 l ${fillW} 0 l ${fillW} ${PROGRESS_H} l 0 ${PROGRESS_H}{\\p0}`);
    }
  }

  // Countdown numbers: 3 (RIDDLE_END→RIDDLE_END+1.33), 2 (→+2.67), 1 (→+4)
  const countDigitDur = countdownTotalSec / 3;
  for (let d = 3; d >= 1; d--) {
    const ds = RIDDLE_END + (3 - d) * countDigitDur;
    const de = ds + countDigitDur;
    lines.push(`Dialogue: 4,${t(ds)},${t(de)},CountdownNum,,0,0,0,,{\\an5\\pos(540,${COUNTDOWN_Y})}${d}`);
  }

  // Answer flash (9–9.5s)
  lines.push(`Dialogue: 5,${t(COUNTDOWN_END)},${t(ANSWER_END)},AnswerBig,,0,0,0,,{\\an5\\pos(540,960)}${esc(answerDisplay)}`);

  // Loop trigger line (9.5–11s)
  lines.push(`Dialogue: 0,${t(ANSWER_END)},${t(LOOP_END)},LoopTrigger,,0,0,0,,{\\an5\\pos(540,960)}${esc(loopLine.toUpperCase())}`);

  const fullContent = assContent + lines.join('\n') + '\n';
  await fs.promises.writeFile(assPath, fullContent, 'utf8');
  return assPath;
}

/**
 * Process a riddle render job (same pipeline structure as trivia).
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

  const hook = (script?.hook || content?.hook || 'Can you solve this?').trim();
  const category = (content?.category || 'Riddle').toString().slice(0, 40);
  const riddleText = (content?.riddle_text || '').trim().slice(0, 250);
  const answerText = (content?.answer_text || '').trim().slice(0, 60);

  const backgroundStoragePath = render.background_storage_path ?? null;
  const backgroundId = render.background_id ?? 1;

  let bgPath, motionPath, audioPath, musicPath, baseVideoPath, finalVideoPath;

  try {
    // 1. Download background
    const imageUrl = await getBackgroundImageUrl(backgroundId, backgroundStoragePath);
    const axios = (await import('axios')).default;
    const fs = (await import('fs')).default;
    bgPath = join(tmpdir(), `riddle-bg-${renderId}-${Date.now()}.png`);
    const imgResp = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
    await fs.promises.writeFile(bgPath, imgResp.data);

    // 2. Apply motion (11s)
    motionPath = await applyMotionToImage(bgPath, DURATION);

    // Riddle number for this channel
    let riddleNumber = 1;
    if (channelId && story?.id) {
      const { count } = await supabaseClient
        .from('orbix_stories')
        .select('*', { count: 'exact', head: true })
        .eq('channel_id', channelId)
        .eq('category', 'riddle')
        .lte('created_at', story.created_at || new Date().toISOString());
      riddleNumber = Math.max(1, count ?? 1);
    }

    const loopTriggerText = RIDDLE_LOOP_LINES[randomInt(RIDDLE_LOOP_LINES.length)];

    // 3. Generate ASS overlay
    const assFilePath = await generateRiddleASSFile(
      {
        hookText: ENABLE_INTRO_HOOK ? hook : null,
        enableIntroHook: ENABLE_INTRO_HOOK,
        category,
        riddleNumber,
        riddleText,
        answerText,
        loopTriggerText
      },
      DURATION
    );

    const simpleAssPath = join(tmpdir(), `riddle-ass-${renderId}-${Date.now()}.ass`);
    await fs.promises.copyFile(assFilePath, simpleAssPath);
    const simpleAssPathEscaped = simpleAssPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");

    // 4. Black overlay + ASS burn
    baseVideoPath = join(tmpdir(), `riddle-base-${renderId}-${Date.now()}.mp4`);
    const filterComplex = [
      `[0:v]drawbox=x=0:y=0:w=iw:h=ih:color=black@0.4:t=fill[v1]`,
      `[v1]ass='${simpleAssPathEscaped}'[vout]`
    ].join(';');
    await execAsync(
      `ffmpeg -i "${motionPath}" -filter_complex "${filterComplex}" -map "[vout]" -map 0:a? -c:v libx264 -preset medium -crf 23 -c:a copy -t ${DURATION} -pix_fmt yuv420p -y "${baseVideoPath}"`,
      { timeout: 120000 }
    );

    try { await unlinkAsync(assFilePath); } catch (_) {}
    try { await unlinkAsync(simpleAssPath); } catch (_) {}

    // 5. Generate TTS audio — reuse trivia audio generator (hook + question-as-riddle + answer)
    const audioResult = await generateTriviaAudio(
      {
        hook: ENABLE_INTRO_HOOK ? hook : null,
        question: riddleText,
        answerText: `The answer is ${answerText}.`,
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
        `ffmpeg -i "${baseVideoPath}" -i "${audioPath}" -i "${musicPath}" -filter_complex "[1:a]apad=pad_dur=${padDur},volume=1.5625[voice];[2:a]volume=0.140625[music];[voice][music]amix=inputs=2:duration=first:dropout_transition=2[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -t ${DURATION} -y "${finalVideoPath}"`,
        { timeout: 60000 }
      );
    } else {
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
        render_step: 'RIDDLE_RENDER',
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
    for (const p of [bgPath, motionPath, audioPath, musicPath, baseVideoPath, finalVideoPath].filter(Boolean)) {
      try { await unlinkAsync(p); } catch (_) {}
    }
  }
}
