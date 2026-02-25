/**
 * Kid Quiz Studio — Shorts Renderer
 * Renders a single-question 1080x1920 vertical Short using FFmpeg.
 * Reuses shared helpers from orbix video-renderer (applyMotionToImage, uploadRenderToStorage).
 *
 * Timeline (11 seconds):
 *  0.0–1.0s  Hook text (full screen)
 *  1.0–5.0s  Question + A/B/C options appear
 *  5.0–9.0s  Progress bar countdown
 *  9.0–9.5s  Correct answer flashes (visual only, no TTS)
 *  9.5–11.0s Loop line spoken — hard cut → loops
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { unlink, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomInt } from 'crypto';
import { supabaseClient } from '../../config/database.js';
import {
  applyMotionToImage,
  uploadRenderToStorage
} from '../orbix-network/video-renderer.js';

const execAsync = promisify(exec);
const unlinkAsync = promisify(unlink);

const DURATION = 11;
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET_KIDQUIZ_RENDERS || 'kidquiz-videos';

// Backgrounds reuse the orbix bucket (same server, same images)
const BG_BUCKET = process.env.SUPABASE_STORAGE_BUCKET_ORBIX_BACKGROUNDS || 'orbix-network-backgrounds';
const TOTAL_BG = 12;

const LOOP_LINES = [
  'Did you get it right?',
  'Be honest… did you know?',
  'Watch it again!',
  'Are you sure about that?',
  "That's the tricky one…",
  'Could you beat your friends?'
];

async function getBackground() {
  const id = randomInt(1, TOTAL_BG + 1);
  const path = `Photo${id}.png`;
  const result = supabaseClient.storage.from(BG_BUCKET).getPublicUrl(path);
  if (!result?.data?.publicUrl) throw new Error('Could not get background URL');
  return result.data.publicUrl;
}

async function generateAudio(hook, question, loopLine) {
  const OpenAI = (await import('openai')).default;
  const fs = (await import('fs')).default;
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const ts = Date.now();
  const hookPath = join(tmpdir(), `kq-hook-${ts}.mp3`);
  const qPath = join(tmpdir(), `kq-q-${ts}.mp3`);
  const loopPath = join(tmpdir(), `kq-loop-${ts}.mp3`);
  const mixPath = join(tmpdir(), `kq-mix-${ts}.mp3`);

  const getDur = async (p) => {
    try {
      const r = await execAsync(`ffprobe -i "${p}" -show_entries format=duration -v quiet -of csv="p=0"`, { timeout: 5000 });
      return parseFloat(r.stdout.trim()) || 0;
    } catch { return 0; }
  };

  const [hookResp, qResp, loopResp] = await Promise.all([
    openai.audio.speech.create({ model: 'tts-1', voice: 'nova', input: hook }),
    openai.audio.speech.create({ model: 'tts-1', voice: 'nova', input: question }),
    openai.audio.speech.create({ model: 'tts-1', voice: 'nova', input: loopLine })
  ]);

  await fs.promises.writeFile(hookPath, Buffer.from(await hookResp.arrayBuffer()));
  await fs.promises.writeFile(qPath, Buffer.from(await qResp.arrayBuffer()));
  await fs.promises.writeFile(loopPath, Buffer.from(await loopResp.arrayBuffer()));

  const hookDur = await getDur(hookPath);
  const qDur = await getDur(qPath);

  // Timeline: hook at 0s, question at 1s, loop at 9.5s
  // Build sequential audio with silence gaps using concat:
  // [silence_before_q] = gap between hook end and 1s
  // [silence_before_loop] = gap between question end and 9.5s
  const silenceBeforeQ = Math.max(0, 1.0 - hookDur);
  const questionEnds = 1.0 + qDur;
  const silenceBeforeLoop = Math.max(0, 9.5 - questionEnds);
  const loopStart = Math.max(questionEnds, 9.5);
  const silenceAfterLoop = Math.max(0, DURATION - loopStart - 1.5);

  // Use ffmpeg concat with generated silence segments
  const filter = [
    // hook -> silence -> question -> silence -> loop -> tail silence
    `[0:a]asetpts=PTS-STARTPTS[h]`,
    `[1:a]asetpts=PTS-STARTPTS[q]`,
    `[2:a]asetpts=PTS-STARTPTS[l]`,
    `aevalsrc=0:c=mono:s=44100:d=${silenceBeforeQ.toFixed(3)}[sq]`,
    `aevalsrc=0:c=mono:s=44100:d=${silenceBeforeLoop.toFixed(3)}[sl]`,
    `aevalsrc=0:c=mono:s=44100:d=${silenceAfterLoop.toFixed(3)}[st]`,
    `[h][sq][q][sl][l][st]concat=n=6:v=0:a=1[aout]`
  ].join(';');

  await execAsync(
    `ffmpeg -i "${hookPath}" -i "${qPath}" -i "${loopPath}" -filter_complex "${filter}" -map "[aout]" -c:a libmp3lame -q:a 2 -t ${DURATION} -y "${mixPath}"`,
    { timeout: 90000 }
  );

  for (const p of [hookPath, qPath, loopPath]) {
    try { await unlinkAsync(p); } catch (_) {}
  }
  return mixPath;
}

function escAss(s) {
  return (s || '').toString().replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
}

function t(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = (sec % 60).toFixed(2).padStart(5, '0');
  return `${h}:${String(m).padStart(2, '0')}:${s}`;
}

async function buildASS(hook, question, optionA, optionB, optionC, correctLetter, loopLine) {
  const fs = (await import('fs')).default;
  const assPath = join(tmpdir(), `kq-${Date.now()}.ass`);

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
Collisions: Normal
WrapStyle: 1

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Hook,Arial Black,96,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,2,5,60,60,60,1
Style: Question,Arial Black,72,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,2,5,60,60,800,1
Style: Option,Arial Rounded MT Bold,60,&H00FFFFFF,&H000000FF,&H00222222,&HCC000000,0,0,0,0,100,100,0,0,3,2,0,5,60,60,0,1
Style: OptionCorrect,Arial Rounded MT Bold,60,&H0000FF00,&H000000FF,&H00000000,&HCC000000,-1,0,0,0,100,100,0,0,1,3,0,5,60,60,0,1
Style: LoopLine,Arial Black,80,&H00FFFF00,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,2,5,60,60,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const lines = [header];

  // Hook: 0–1s centered
  lines.push(`Dialogue: 0,${t(0)},${t(1)},Hook,,0,0,0,,{\\an5\\pos(540,960)\\fad(100,100)}${escAss(hook.toUpperCase())}`);

  // Question: 1–9s, upper area
  const qWrapped = escAss(question);
  lines.push(`Dialogue: 1,${t(1)},${t(9)},Question,,0,0,0,,{\\an5\\pos(540,520)\\fad(150,0)}${qWrapped}`);

  // Options: stagger in 1.3s / 1.6s / 1.9s
  const opts = [
    { label: 'A', text: optionA, y: 900 },
    { label: 'B', text: optionB, y: 1020 },
    { label: 'C', text: optionC, y: 1140 }
  ];
  for (const o of opts) {
    const style = (o.label === correctLetter) ? 'OptionCorrect' : 'Option';
    const fadeStart = 1 + opts.indexOf(o) * 0.3;
    // Show correct answer green on reveal (9–9.5s), others hidden
    lines.push(`Dialogue: 1,${t(fadeStart)},${t(9)},Option,,0,0,0,,{\\an5\\pos(540,${o.y})\\fad(200,0)}${escAss(o.label + ')  ' + o.text)}`);
    if (o.label === correctLetter) {
      lines.push(`Dialogue: 2,${t(9)},${t(9.5)},OptionCorrect,,0,0,0,,{\\an5\\pos(540,960)\\fad(0,0)}✓  ${escAss(o.label + ')  ' + o.text)}`);
    }
  }

  // Loop line: 9.5–11s
  lines.push(`Dialogue: 3,${t(9.5)},${t(11)},LoopLine,,0,0,0,,{\\an5\\pos(540,960)\\fad(100,200)}${escAss(loopLine)}`);

  await fs.promises.writeFile(assPath, lines.join('\n'), 'utf8');
  return assPath;
}

export async function renderKidQuizShort(render, project) {
  const renderId = render.id;
  const businessId = render.business_id;
  const question = project.questions?.[0];
  const answers = question?.answers || [];
  const correctAnswer = answers.find(a => a.is_correct);

  const hook = (project.hook_text || `Can you answer this ${project.category} question?`).trim();
  const questionText = question?.question_text || '';
  const optionA = answers.find(a => a.label === 'A')?.answer_text || '';
  const optionB = answers.find(a => a.label === 'B')?.answer_text || '';
  const optionC = answers.find(a => a.label === 'C')?.answer_text || '';
  const correctLetter = correctAnswer?.label || 'A';
  const loopLine = LOOP_LINES[randomInt(LOOP_LINES.length)];

  console.log(`[KidQuiz Renderer] Starting render_id=${renderId}`);

  let bgPath, motionPath, assPath, audioPath, baseVideoPath, finalVideoPath;

  try {
    await supabaseClient
      .from('kidquiz_renders')
      .update({ render_status: 'RENDERING', updated_at: new Date().toISOString() })
      .eq('id', renderId);

    // 1. Background — use uploaded photo if available, otherwise pick a random one
    const axios = (await import('axios')).default;
    const fs = (await import('fs')).default;
    const bgUrl = project.photo_url || await getBackground();
    bgPath = join(tmpdir(), `kq-bg-${renderId}-${Date.now()}.jpg`);
    const imgResp = await axios.get(bgUrl, { responseType: 'arraybuffer', timeout: 30000 });
    await fs.promises.writeFile(bgPath, imgResp.data);

    // 2. Motion (11s)
    motionPath = await applyMotionToImage(bgPath, DURATION);

    // 3. ASS subtitles
    assPath = await buildASS(hook, questionText, optionA, optionB, optionC, correctLetter, loopLine);
    const assEscaped = assPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");

    // 4. Base video with dark overlay + progress bar + ASS
    baseVideoPath = join(tmpdir(), `kq-base-${renderId}-${Date.now()}.mp4`);
    const barY = 870, barW = 960, barH = 16, barX = 60;
    // Progress bar 5–9s (4s countdown)
    const filterComplex = [
      `[0:v]drawbox=x=0:y=0:w=iw:h=ih:color=black@0.45:t=fill,drawbox=x=${barX}:y=${barY}:w=${barW}:h=${barH}:color=0x404040:t=fill:enable='between(t\\,5\\,9)'[v1]`,
      `color=c=0xFF6B6B:s=${barW}x${barH}:d=${DURATION},scale=eval=frame:w='if(lt(t\\,5)\\,${barW}\\,if(gt(t\\,9)\\,1\\,max(1\\,${barW}*(9-t)/4)))':h=${barH}[bar]`,
      `[v1][bar]overlay=x=${barX}:y=${barY}:enable='between(t\\,5\\,9)'[v2]`,
      `[v2]ass='${assEscaped}'[vout]`
    ].join(';');

    await execAsync(
      `ffmpeg -i "${motionPath}" -filter_complex "${filterComplex}" -map "[vout]" -map 0:a? -c:v libx264 -preset medium -crf 23 -c:a copy -t ${DURATION} -pix_fmt yuv420p -y "${baseVideoPath}"`,
      { timeout: 120000 }
    );

    try { await unlinkAsync(assPath); assPath = null; } catch (_) {}

    // 5. TTS audio
    audioPath = await generateAudio(hook, questionText, loopLine);

    // 6. Mix voice onto video
    finalVideoPath = join(tmpdir(), `kq-final-${renderId}-${Date.now()}.mp4`);
    const padDur = Math.max(0, DURATION - DURATION);
    await execAsync(
      `ffmpeg -i "${baseVideoPath}" -i "${audioPath}" -filter_complex "[1:a]apad=pad_dur=${padDur},volume=1.4[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -t ${DURATION} -y "${finalVideoPath}"`,
      { timeout: 60000 }
    );

    // 7. Upload to storage
    const fs2 = (await import('fs')).default;
    const buffer = await fs2.promises.readFile(finalVideoPath);
    const remotePath = `${businessId}/${renderId}.mp4`;
    const { data: uploadData, error: uploadErr } = await supabaseClient.storage
      .from(STORAGE_BUCKET)
      .upload(remotePath, buffer, { contentType: 'video/mp4', upsert: true });
    if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

    const { data: urlData } = supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(uploadData.path);
    const outputUrl = urlData?.publicUrl ? `${urlData.publicUrl}?v=${Date.now()}` : null;

    await supabaseClient
      .from('kidquiz_renders')
      .update({ render_status: 'READY_FOR_UPLOAD', output_url: outputUrl, updated_at: new Date().toISOString() })
      .eq('id', renderId);

    await supabaseClient
      .from('kidquiz_projects')
      .update({ status: 'READY', updated_at: new Date().toISOString() })
      .eq('id', project.id);

    console.log(`[KidQuiz Renderer] Done render_id=${renderId}`);
    return { outputUrl };
  } catch (err) {
    console.error(`[KidQuiz Renderer] FAILED render_id=${renderId}`, err.message);
    await supabaseClient.from('kidquiz_renders')
      .update({ render_status: 'FAILED', step_error: err.message, updated_at: new Date().toISOString() })
      .eq('id', renderId);
    await supabaseClient.from('kidquiz_projects')
      .update({ status: 'FAILED', updated_at: new Date().toISOString() })
      .eq('id', project.id);
    throw err;
  } finally {
    for (const p of [bgPath, motionPath, assPath, audioPath, baseVideoPath, finalVideoPath].filter(Boolean)) {
      try { await unlinkAsync(p); } catch (_) {}
    }
  }
}
