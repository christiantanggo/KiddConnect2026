/**
 * Orbix Mind Teaser Render Pipeline
 *
 * Format (match riddle + user spec):
 *   0–T:       Question text on screen + TTS reads question
 *   T–(T+1)s:  1 second pause (question still on screen)
 *   (T+1)–(T+4)s: 3-2-1 countdown (exactly 3 seconds)
 *   (T+4)–(T+4.5)s: Answer flash 0.5s + TTS speaks answer
 *   Hard cut / loop-friendly
 *
 * Total duration: question_tts_duration + 1 + 3 + max(0.5, answer_tts_duration) ≈ 10–12s
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
  prepareMusicTrack,
  uploadRenderToStorage,
  applyMotionToImage
} from './video-renderer.js';
import { buildYouTubeMetadata } from './youtube-metadata.js';
import { writeProgressLog, setCurrentRender } from '../../utils/crash-and-progress-log.js';
import { ModuleSettings } from '../../models/v2/ModuleSettings.js';

const execAsync = promisify(exec);
const unlinkAsync = promisify(unlink);

const MUSIC_BUCKET = process.env.SUPABASE_STORAGE_BUCKET_ORBIX_MUSIC || 'orbix-network-music';
const MUSIC_EXT = /\.(mp3|m4a|aac|wav|ogg)$/i;

const PAUSE_AFTER_QUESTION = 1.0;
const COUNTDOWN_DURATION = 3.0;
const ANSWER_FLASH_DURATION = 0.5;

const MINDTEASER_LOOP_LINES = [
  'Did you get it?',
  'Think again…',
  "Don't overthink it.",
  'Most people miss this.',
  'Watch one more time.'
];

async function getAnyMusicTrack(businessId) {
  try {
    const { data: folders, error: fErr } = await supabaseClient.storage
      .from(MUSIC_BUCKET)
      .list(businessId, { limit: 50 });
    if (fErr || !folders?.length) return null;
    const allTracks = [];
    for (const folder of folders) {
      if (!folder.name) continue;
      const prefix = `${businessId}/${folder.name}`;
      const { data: files } = await supabaseClient.storage.from(MUSIC_BUCKET).list(prefix, { limit: 100 });
      if (!files?.length) continue;
      for (const f of files) {
        if (f.name && MUSIC_EXT.test(f.name)) {
          const path = `${prefix}/${f.name}`;
          const { data } = supabaseClient.storage.from(MUSIC_BUCKET).getPublicUrl(path);
          if (data?.publicUrl) allTracks.push({ name: f.name, url: data.publicUrl });
        }
      }
    }
    if (!allTracks.length) return null;
    return allTracks[randomInt(allTracks.length)];
  } catch (e) {
    console.warn('[Mind Teaser Renderer] Could not load music track:', e?.message);
    return null;
  }
}

/**
 * Generate TTS for question and answer; return paths and durations.
 * Audio layout: [question TTS] [1s silence] [3s silence] [answer TTS] → total = qDur + 1 + 3 + aDur
 */
async function generateMindTeaserAudio(questionText, answerText, totalDuration) {
  const OpenAI = (await import('openai')).default;
  const fs = (await import('fs')).default;
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const questionPhrase = (questionText || '').trim().slice(0, 200);
  const answerPhrase = `The answer is ${(answerText || '').trim().slice(0, 80)}.`;
  if (!questionPhrase) throw new Error('No question text for mind teaser TTS');

  const qPath = join(tmpdir(), `mindteaser-q-${Date.now()}.mp3`);
  const aPath = join(tmpdir(), `mindteaser-a-${Date.now()}.mp3`);
  const outPath = join(tmpdir(), `mindteaser-mixed-${Date.now()}.mp3`);

  const getDur = async (p) => {
    try {
      const r = await execAsync(
        `ffprobe -i "${p}" -show_entries format=duration -v quiet -of csv="p=0"`,
        { timeout: 5000 }
      );
      return parseFloat(r.stdout.trim()) || 0;
    } catch {
      return 0;
    }
  };

  try {
    const [qResp, aResp] = await Promise.all([
      openai.audio.speech.create({ model: 'tts-1', voice: 'alloy', input: questionPhrase }),
      openai.audio.speech.create({ model: 'tts-1', voice: 'alloy', input: answerPhrase })
    ]);
    await fs.promises.writeFile(qPath, Buffer.from(await qResp.arrayBuffer()));
    await fs.promises.writeFile(aPath, Buffer.from(await aResp.arrayBuffer()));

    const qDur = await getDur(qPath);
    const aDur = await getDur(aPath);

    // Layout: question at 0, 1s silence, 3s silence, answer at qDur+4
    const answerStart = qDur + PAUSE_AFTER_QUESTION + COUNTDOWN_DURATION;
    const actualTotal = answerStart + Math.max(ANSWER_FLASH_DURATION, aDur);
    const padTotal = Math.max(totalDuration || actualTotal, actualTotal);

    const filter = [
      `[0:a]apad=pad_dur=${padTotal - qDur}[q]`,
      `[1:a]adelay=${Math.round(answerStart * 1000)}|${Math.round(answerStart * 1000)},apad=pad_dur=${Math.max(0, padTotal - answerStart - aDur)}[a]`,
      `[q][a]amix=inputs=2:duration=first:dropout_transition=0[aout]`
    ].join(';');
    await execAsync(
      `ffmpeg -i "${qPath}" -i "${aPath}" -filter_complex "${filter}" -map "[aout]" -c:a libmp3lame -q:a 2 -t ${padTotal} -y "${outPath}"`,
      { timeout: 60000 }
    );

    return { audioPath: outPath, duration: padTotal, questionDuration: qDur, answerDuration: aDur };
  } finally {
    for (const p of [qPath, aPath].filter(Boolean)) {
      try { await unlinkAsync(p); } catch (_) {}
    }
  }
}

/**
 * Generate ASS subtitle file for mind teaser. Timing is dynamic from question TTS duration.
 * questionEnd = questionDuration + 1 (pause), countdownEnd = questionEnd + 3, answerEnd = countdownEnd + 0.5
 */
async function generateMindTeaserASSFile(opts) {
  const fs = (await import('fs')).default;
  const assPath = join(tmpdir(), `orbix-mindteaser-${Date.now()}.ass`);
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

  const questionText = (opts.questionText || '').trim().toUpperCase();
  const answerDisplay = `ANSWER: ${(opts.answerText || '').toUpperCase()}`;
  const loopLine = (opts.loopTriggerText || 'Did you get it?').trim().toUpperCase();

  const qDur = opts.questionDuration ?? 5;
  const questionEnd = qDur + PAUSE_AFTER_QUESTION;
  const countdownEnd = questionEnd + COUNTDOWN_DURATION;
  const answerEnd = countdownEnd + ANSWER_FLASH_DURATION;
  const totalDur = opts.totalDuration ?? (answerEnd + 0.5);

  const wordCount = (opts.questionText || '').split(/\s+/).length;
  let fontSize = 84;
  if (wordCount <= 8) fontSize = 96;
  else if (wordCount <= 14) fontSize = 84;
  else if (wordCount <= 22) fontSize = 72;
  else fontSize = 62;

  const wrapText = (text, maxChars) => {
    const words = (text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? cur + ' ' + w : w;
      if (next.length <= maxChars) cur = next;
      else { if (cur) lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    return lines.map(l => esc(l)).join('\\N');
  };
  const charsPerLine = Math.floor(820 / (fontSize * 0.55));
  const wrappedQuestion = wrapText(questionText, charsPerLine);

  const QUESTION_CENTER_Y = 640;
  const PROGRESS_W = 900;
  const PROGRESS_H = 14;
  const PROGRESS_X = (1080 - PROGRESS_W) / 2;
  const PROGRESS_Y = 1600;
  const pbTop = PROGRESS_Y - Math.round(PROGRESS_H / 2);
  const COUNTDOWN_NUM_Y = PROGRESS_Y - 70;

  const countdownSegments = [
    { digit: '3', start: questionEnd, end: questionEnd + 1.0 },
    { digit: '2', start: questionEnd + 1.0, end: questionEnd + 2.0 },
    { digit: '1', start: questionEnd + 2.0, end: countdownEnd }
  ];
  const progressKeyframes = [
    { start: questionEnd, end: questionEnd + 1.0, fillW: PROGRESS_W },
    { start: questionEnd + 1.0, end: questionEnd + 2.0, fillW: Math.round(PROGRESS_W * 2 / 3) },
    { start: questionEnd + 2.0, end: countdownEnd, fillW: Math.round(PROGRESS_W * 1 / 3) }
  ];

  const assContent = `[Script Info]
Title: Orbix Mind Teaser
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Question,Arial,${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,2,0,1,4,2,5,60,60,10,1
Style: ProgressBg,Arial,12,&H44FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: ProgressFill,Arial,12,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: CountdownNum,Arial,130,&H00FFFF00,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,5,3,5,80,80,10,1
Style: Answer,Arial,${fontSize + 10},&H00FFFF00,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,5,3,5,80,80,10,1
Style: LoopTrigger,Arial,68,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,3,1,5,60,60,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const lines = [];
  lines.push(`Dialogue: 0,${t(0)},${t(countdownEnd)},Question,,0,0,0,,{\\an5\\pos(540,${QUESTION_CENTER_Y})}${wrappedQuestion}`);
  lines.push(`Dialogue: 1,${t(questionEnd)},${t(countdownEnd)},ProgressBg,,0,0,0,,{\\an7\\pos(${PROGRESS_X},${pbTop})\\p1}m 0 0 l ${PROGRESS_W} 0 l ${PROGRESS_W} ${PROGRESS_H} l 0 ${PROGRESS_H}{\\p0}`);
  for (const kf of progressKeyframes) {
    lines.push(`Dialogue: 2,${t(kf.start)},${t(kf.end)},ProgressFill,,0,0,0,,{\\an7\\pos(${PROGRESS_X},${pbTop})\\p1}m 0 0 l ${kf.fillW} 0 l ${kf.fillW} ${PROGRESS_H} l 0 ${PROGRESS_H}{\\p0}`);
  }
  for (const seg of countdownSegments) {
    lines.push(`Dialogue: 3,${t(seg.start)},${t(seg.end)},CountdownNum,,0,0,0,,{\\an5\\pos(540,${COUNTDOWN_NUM_Y})}${seg.digit}`);
  }
  lines.push(`Dialogue: 4,${t(countdownEnd)},${t(answerEnd)},Answer,,0,0,0,,{\\an5\\pos(540,960)}${esc(answerDisplay)}`);
  lines.push(`Dialogue: 0,${t(answerEnd)},${t(totalDur)},LoopTrigger,,0,0,0,,{\\an5\\pos(540,960)}${esc(loopLine)}`);

  await fs.promises.writeFile(assPath, assContent + lines.join('\n') + '\n', 'utf8');
  return assPath;
}

/**
 * Process a mind teaser render job.
 */
export async function processMindTeaserRenderJob(render, story, script) {
  const renderId = render.id;
  const businessId = render.business_id;

  const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, 'orbix-network').catch(() => null);
  const ENABLE_INTRO_HOOK = moduleSettings?.settings?.enable_intro_hook === true;

  writeProgressLog('MINDTEASER_RENDER_START', { renderId });
  setCurrentRender(renderId, 'MINDTEASER_RENDER');

  const content = script?.content_json
    ? (typeof script.content_json === 'string' ? JSON.parse(script.content_json) : script.content_json)
    : {};

  const questionText = (content?.question || '').trim().slice(0, 250);
  const answerText = (content?.answer || '').trim().slice(0, 80);

  if (!questionText || !answerText) {
    throw new Error(`Mind teaser render missing content: question="${questionText}" answer="${answerText}"`);
  }

  const backgroundStoragePath = render.background_storage_path ?? null;
  const backgroundId = render.background_id ?? 1;

  let bgPath, motionPath, audioPath, musicPath, baseVideoPath, finalVideoPath, assFilePath, simpleAssPath;

  try {
    const imageUrl = await getBackgroundImageUrl(backgroundId, backgroundStoragePath);
    const axios = (await import('axios')).default;
    const fs = (await import('fs')).default;
    bgPath = join(tmpdir(), `mindteaser-bg-${renderId}-${Date.now()}.png`);
    const imgResp = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
    await fs.promises.writeFile(bgPath, imgResp.data);

    // 1. Generate TTS first to get question duration (then we know total duration)
    const audioResult = await generateMindTeaserAudio(questionText, answerText);
    audioPath = audioResult.audioPath;
    const totalDuration = audioResult.duration;
    const questionDuration = audioResult.questionDuration;

    // 2. Motion background for full duration
    motionPath = await applyMotionToImage(bgPath, totalDuration);

    const loopTriggerText = MINDTEASER_LOOP_LINES[randomInt(MINDTEASER_LOOP_LINES.length)];

    // 3. ASS overlay with dynamic timing
    assFilePath = await generateMindTeaserASSFile({
      questionText,
      answerText,
      loopTriggerText,
      questionDuration,
      totalDuration
    });
    simpleAssPath = join(tmpdir(), `mindteaser-ass-${renderId}-${Date.now()}.ass`);
    await fs.promises.copyFile(assFilePath, simpleAssPath);
    const escapedAssPath = simpleAssPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");

    // 4. Burn ASS onto video
    baseVideoPath = join(tmpdir(), `mindteaser-base-${renderId}-${Date.now()}.mp4`);
    const filterComplex = [
      `[0:v]drawbox=x=0:y=0:w=iw:h=ih:color=black@0.45:t=fill[v1]`,
      `[v1]ass='${escapedAssPath}'[vout]`
    ].join(';');
    await execAsync(
      `ffmpeg -i "${motionPath}" -filter_complex "${filterComplex}" -map "[vout]" -map 0:a? -c:v libx264 -preset medium -crf 23 -c:a copy -t ${totalDuration} -pix_fmt yuv420p -y "${baseVideoPath}"`,
      { timeout: 120000 }
    );

    try { await unlinkAsync(assFilePath); } catch (_) {}
    try { await unlinkAsync(simpleAssPath); } catch (_) {}

    // 5. Mix voice + optional music
    finalVideoPath = join(tmpdir(), `mindteaser-final-${renderId}-${Date.now()}.mp4`);
    const musicTrack = await getAnyMusicTrack(businessId);
    if (musicTrack) {
      musicPath = await prepareMusicTrack(musicTrack.url, totalDuration);
    }

    if (musicPath) {
      await execAsync(
        `ffmpeg -i "${baseVideoPath}" -i "${audioPath}" -i "${musicPath}" -filter_complex "[1:a]volume=1.5625[voice];[2:a]volume=0.140625[music];[voice][music]amix=inputs=2:duration=first:dropout_transition=2[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -t ${totalDuration} -y "${finalVideoPath}"`,
        { timeout: 60000 }
      );
    } else {
      await execAsync(
        `ffmpeg -i "${baseVideoPath}" -i "${audioPath}" -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -t ${totalDuration} -y "${finalVideoPath}"`,
        { timeout: 60000 }
      );
    }

    const { title, description, hashtags } = buildYouTubeMetadata(story, script, renderId);
    await supabaseClient
      .from('orbix_renders')
      .update({
        youtube_title: title,
        youtube_description: description,
        hashtags,
        render_step: 'MINDTEASER_RENDER',
        step_progress: 100,
        step_completed_at: new Date().toISOString()
      })
      .eq('id', renderId);

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

    writeProgressLog('MINDTEASER_RENDER_DONE', { renderId, url: storageUrl });
    return { status: 'RENDER_COMPLETE', outputUrl: storageUrl, renderId };
  } catch (error) {
    console.error(`[Mind Teaser Renderer] FAILED render_id=${renderId}`, error.message);
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
