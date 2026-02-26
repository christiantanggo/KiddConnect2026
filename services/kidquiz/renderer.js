/**
 * Kid Quiz Studio — Shorts Renderer
 * Renders a single-question 1080x1920 vertical Short using FFmpeg.
 * Reuses shared helpers from orbix video-renderer (applyMotionToImage, uploadRenderToStorage).
 *
 * Dynamic Timeline (computed from actual TTS durations):
 *  0.0 – hookEnd        Hook phrase (full screen)
 *  hookEnd – qEnd       Question spoken + Q text visible
 *  qEnd – countdownEnd  Countdown timer with progress bar between Q and answers
 *  countdownEnd – revealEnd  Correct answer reveal flash
 *  revealEnd – DURATION Loop line spoken
 *
 * The progress bar sits between the question text and answer options.
 * Countdown numbers (5,4,3,2,1) appear on top of the bar.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { unlink } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomInt } from 'crypto';
import { supabaseClient } from '../../config/database.js';
import {
  applyMotionToImage,
} from '../orbix-network/video-renderer.js';

const execAsync = promisify(exec);
const unlinkAsync = promisify(unlink);

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET_KIDQUIZ_RENDERS || 'kidquiz-videos';
const BG_BUCKET = process.env.SUPABASE_STORAGE_BUCKET_ORBIX_BACKGROUNDS || 'orbix-network-backgrounds';
const TOTAL_BG = 12;

// Fixed timing constants (seconds)
const HOOK_WINDOW   = 1.5;   // how long hook phrase shows on screen
const Q_BUFFER      = 0.4;   // silence after question audio before countdown starts
const COUNTDOWN_DUR = 5;     // always 5-second countdown
const REVEAL_DUR    = 1.0;   // correct answer flash
const LOOP_BUFFER   = 0.5;   // silence before loop line starts
const LOOP_TAIL     = 1.5;   // extra silence after loop line ends

const HOOK_LINES = [
  'Think you know this one?',
  'Can you guess it?',
  "Here's a tricky one!",
  'Test your brain!',
  'Do you know the answer?',
  'Only the smartest get this one!',
  'Quick — what do you think?',
  "Let's see how smart you are!",
  'This one will get you thinking!',
  'Are you ready for this?'
];

const LOOP_LINES = [
  'Follow for a new question every day!',
  'Did you get it? Drop a comment!',
  'Share this with someone who got it wrong!',
  'Follow for more quizzes like this!',
  'Save this and challenge your friends!',
  'How fast did you figure it out?',
  'Think you can beat your friends? Send it to them!'
];

async function getBackground() {
  const id = randomInt(1, TOTAL_BG + 1);
  const path = `Photo${id}.png`;
  const result = supabaseClient.storage.from(BG_BUCKET).getPublicUrl(path);
  if (!result?.data?.publicUrl) throw new Error('Could not get background URL');
  return result.data.publicUrl;
}

async function getDur(p) {
  try {
    const r = await execAsync(`ffprobe -i "${p}" -show_entries format=duration -v quiet -of csv="p=0"`, { timeout: 8000 });
    return parseFloat(r.stdout.trim()) || 0;
  } catch { return 0; }
}

/**
 * Generate all four TTS clips, measure their durations, return paths + timeline.
 * Clips: hook, question, answer reveal ("The answer is: X"), loop line
 */
async function generateAudioAndTimeline(hook, question, answerReveal, loopLine) {
  const OpenAI = (await import('openai')).default;
  const fs = (await import('fs')).default;
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const ts = Date.now();
  const hookPath    = join(tmpdir(), `kq-hook-${ts}.mp3`);
  const qPath       = join(tmpdir(), `kq-q-${ts}.mp3`);
  const answerPath  = join(tmpdir(), `kq-ans-${ts}.mp3`);
  const loopPath    = join(tmpdir(), `kq-loop-${ts}.mp3`);
  const mixPath     = join(tmpdir(), `kq-mix-${ts}.mp3`);

  // Generate all TTS in parallel
  const [hookResp, qResp, answerResp, loopResp] = await Promise.all([
    openai.audio.speech.create({ model: 'tts-1', voice: 'nova', input: hook }),
    openai.audio.speech.create({ model: 'tts-1', voice: 'nova', input: question }),
    openai.audio.speech.create({ model: 'tts-1', voice: 'nova', input: answerReveal }),
    openai.audio.speech.create({ model: 'tts-1', voice: 'nova', input: loopLine })
  ]);

  await Promise.all([
    fs.promises.writeFile(hookPath,   Buffer.from(await hookResp.arrayBuffer())),
    fs.promises.writeFile(qPath,      Buffer.from(await qResp.arrayBuffer())),
    fs.promises.writeFile(answerPath, Buffer.from(await answerResp.arrayBuffer())),
    fs.promises.writeFile(loopPath,   Buffer.from(await loopResp.arrayBuffer()))
  ]);

  // Measure actual durations
  const [hookDur, qDur, answerDur, loopDur] = await Promise.all([
    getDur(hookPath),
    getDur(qPath),
    getDur(answerPath),
    getDur(loopPath)
  ]);

  // --- Compute dynamic timeline ---
  // Hook audio starts at 0, hook text shows for at least HOOK_WINDOW
  const hookEnd        = Math.max(HOOK_WINDOW, hookDur + 0.2);

  // Question audio starts when hook screen ends
  const qAudioStart    = hookEnd;
  const qAudioEnd      = qAudioStart + qDur;

  // Countdown starts after question finishes speaking + small buffer
  const countdownStart = qAudioEnd + Q_BUFFER;
  const countdownEnd   = countdownStart + COUNTDOWN_DUR;

  // Reveal: TTS says "The answer is: X" — starts right after countdown
  const revealStart    = countdownEnd;
  const revealEnd      = revealStart + answerDur + 0.3; // small tail after voice

  // Loop line follows the reveal
  const loopStart      = revealEnd + LOOP_BUFFER;
  const loopEnd        = loopStart + loopDur;

  // Total video duration
  const DURATION       = loopEnd + LOOP_TAIL;

  console.log(`[KidQuiz] Timeline: hookEnd=${hookEnd.toFixed(2)} qAudioEnd=${qAudioEnd.toFixed(2)} countdown=${countdownStart.toFixed(2)}-${countdownEnd.toFixed(2)} reveal=${revealStart.toFixed(2)}-${revealEnd.toFixed(2)} loop=${loopStart.toFixed(2)}-${loopEnd.toFixed(2)} total=${DURATION.toFixed(2)}s`);

  // --- Build audio mix with precise silence gaps ---
  // Segment order: [hook][silA][question][silB][answer][silC][loop][silD]
  // silA: fills from hookDur → qAudioStart
  // silB: fills from qAudioEnd → revealStart (countdown is silent)
  // silC: the 0.3s tail after answer audio (already in revealEnd calc)
  // silD: LOOP_TAIL
  const silA = Math.max(0, qAudioStart - hookDur);
  const silB = Math.max(0, revealStart - qAudioEnd);
  const silC = Math.max(0, loopStart - revealEnd);

  const filter = [
    `[0:a]asetpts=PTS-STARTPTS[h]`,
    `[1:a]asetpts=PTS-STARTPTS[q]`,
    `[2:a]asetpts=PTS-STARTPTS[an]`,
    `[3:a]asetpts=PTS-STARTPTS[l]`,
    `aevalsrc=0:c=mono:s=44100:d=${silA.toFixed(3)}[sa]`,
    `aevalsrc=0:c=mono:s=44100:d=${silB.toFixed(3)}[sb]`,
    `aevalsrc=0:c=mono:s=44100:d=${silC.toFixed(3)}[sc]`,
    `aevalsrc=0:c=mono:s=44100:d=${LOOP_TAIL.toFixed(3)}[sd]`,
    `[h][sa][q][sb][an][sc][l][sd]concat=n=8:v=0:a=1[aout]`
  ].join(';');

  await execAsync(
    `ffmpeg -i "${hookPath}" -i "${qPath}" -i "${answerPath}" -i "${loopPath}" -filter_complex "${filter}" -map "[aout]" -c:a libmp3lame -q:a 2 -t ${DURATION.toFixed(3)} -y "${mixPath}"`,
    { timeout: 90000 }
  );

  for (const p of [hookPath, qPath, answerPath, loopPath]) {
    try { await unlinkAsync(p); } catch (_) {}
  }

  return {
    mixPath,
    timeline: { hookEnd, qAudioStart, qAudioEnd, countdownStart, countdownEnd, revealStart, revealEnd, loopStart, loopEnd, DURATION }
  };
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

async function buildASS(hook, question, optionA, optionB, optionC, correctLetter, loopLine, tl) {
  const fs = (await import('fs')).default;
  const assPath = join(tmpdir(), `kq-${Date.now()}.ass`);

  const { hookEnd, qAudioStart, countdownStart, countdownEnd, revealStart, revealEnd, loopStart, loopEnd, DURATION } = tl;

  // Layout Y positions (1080x1920 canvas)
  // Question sits in the upper-middle area
  // Progress bar sits between question and answers
  // Answers below the bar
  const qY       = 560;   // question text center Y
  const barY     = 820;   // progress bar top Y (between Q and answers)
  const answerYA = 980;
  const answerYB = 1110;
  const answerYC = 1240;

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
Collisions: Normal
WrapStyle: 1

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Hook,Arial Black,90,&H00FFFFFF,&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,0,0,1,4,2,5,60,60,60,1
Style: Question,Arial Black,68,&H00FFFFFF,&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,0,0,1,3,2,5,80,80,80,1
Style: Option,Arial Rounded MT Bold,56,&H00FFFFFF,&H000000FF,&H00222222,&HCC000000,0,0,0,0,100,100,0,0,3,2,0,5,60,60,0,1
Style: OptionCorrect,Arial Rounded MT Bold,56,&H0000FF00,&H000000FF,&H00000000,&HCC000000,-1,0,0,0,100,100,0,0,1,3,0,5,60,60,0,1
Style: Countdown,Arial Black,72,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,4,2,5,0,0,0,1
Style: LoopLine,Arial Black,76,&H00FFFF00,&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,0,0,1,4,2,5,60,60,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const lines = [header];

  // Hook: 0 – hookEnd, centered on screen
  lines.push(`Dialogue: 0,${t(0)},${t(hookEnd)},Hook,,0,0,0,,{\\an5\\pos(540,960)\\fad(150,150)}${escAss(hook.toUpperCase())}`);

  // Question: shows from when hook ends until countdown ends
  lines.push(`Dialogue: 1,${t(qAudioStart)},${t(countdownEnd)},Question,,0,0,0,,{\\an5\\pos(540,${qY})\\fad(200,0)}${escAss(question)}`);

  // Answers: stagger in after question appears
  const opts = [
    { label: 'A', text: optionA, y: answerYA },
    { label: 'B', text: optionB, y: answerYB },
    { label: 'C', text: optionC, y: answerYC }
  ];
  for (let i = 0; i < opts.length; i++) {
    const o = opts[i];
    const fadeStart = qAudioStart + 0.2 + i * 0.3;
    lines.push(`Dialogue: 1,${t(fadeStart)},${t(countdownEnd)},Option,,0,0,0,,{\\an5\\pos(540,${o.y})\\fad(200,0)}${escAss(o.label + ')  ' + o.text)}`);
  }

  // Countdown numbers: one per second on the bar, centered
  // Each number shows for 1 second, positioned on top of bar
  const countdownBarCenterY = barY + 8; // center of 16px bar
  for (let n = COUNTDOWN_DUR; n >= 1; n--) {
    const numStart = countdownEnd - n;
    const numEnd   = numStart + 1;
    lines.push(`Dialogue: 3,${t(numStart)},${t(numEnd)},Countdown,,0,0,0,,{\\an5\\pos(540,${barY - 55})\\fad(50,50)}${n}`);
  }

  // Correct answer reveal: full-screen centered, green — stays visible while voice speaks the answer
  const correctOpt = opts.find(o => o.label === correctLetter);
  if (correctOpt) {
    lines.push(`Dialogue: 2,${t(revealStart)},${t(loopStart)},OptionCorrect,,0,0,0,,{\\an5\\pos(540,960)\\fad(100,200)}✓  ${escAss(correctLetter + ')  ' + correctOpt.text)}`);
  }

  // Loop line: after reveal
  lines.push(`Dialogue: 3,${t(loopStart)},${t(DURATION)},LoopLine,,0,0,0,,{\\an5\\pos(540,960)\\fad(150,300)}${escAss(loopLine)}`);

  await fs.promises.writeFile(assPath, lines.join('\n'), 'utf8');
  return assPath;
}

export async function renderKidQuizShort(render, project) {
  const renderId   = render.id;
  const businessId = render.business_id;
  const question   = project.questions?.[0];
  const answers    = question?.answers || [];
  const correctAnswer = answers.find(a => a.is_correct);

  const hook          = HOOK_LINES[randomInt(HOOK_LINES.length)];
  const questionText  = question?.question_text || '';
  const optionA       = answers.find(a => a.label === 'A')?.answer_text || '';
  const optionB       = answers.find(a => a.label === 'B')?.answer_text || '';
  const optionC       = answers.find(a => a.label === 'C')?.answer_text || '';
  const correctLetter = correctAnswer?.label || 'A';
  const correctText   = correctAnswer?.answer_text || '';
  const answerReveal  = `The answer is: ${correctText}`;
  const loopLine      = LOOP_LINES[randomInt(LOOP_LINES.length)];

  console.log(`[KidQuiz Renderer] Starting render_id=${renderId}`);

  let bgPath, motionPath, assPath, audioPath, baseVideoPath, finalVideoPath;

  try {
    await supabaseClient
      .from('kidquiz_renders')
      .update({ render_status: 'RENDERING', updated_at: new Date().toISOString() })
      .eq('id', renderId);

    // 1. Background
    const axios = (await import('axios')).default;
    const fs    = (await import('fs')).default;
    const bgUrl = project.photo_url || await getBackground();
    bgPath = join(tmpdir(), `kq-bg-${renderId}-${Date.now()}.jpg`);
    const imgResp = await axios.get(bgUrl, { responseType: 'arraybuffer', timeout: 30000 });
    await fs.promises.writeFile(bgPath, imgResp.data);

    // 2. Generate TTS first so we can build dynamic timeline
    const { mixPath, timeline: tl } = await generateAudioAndTimeline(hook, questionText, answerReveal, loopLine);
    audioPath = mixPath;
    const DURATION = tl.DURATION;

    // 3. Motion video (dynamic duration)
    motionPath = await applyMotionToImage(bgPath, DURATION);

    // 4. ASS subtitles with dynamic timestamps
    assPath = await buildASS(hook, questionText, optionA, optionB, optionC, correctLetter, loopLine, tl);
    const assEscaped = assPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");

    // 5. Base video: dark overlay + progress bar between Q and answers + ASS
    baseVideoPath = join(tmpdir(), `kq-base-${renderId}-${Date.now()}.mp4`);

    // Progress bar sits between question and answers
    // barY=820 in ASS; we align drawbox to the same pixel rows
    const barX = 60;
    const barW = 960;
    const barH = 16;
    const barY = 820;
    const cdS  = tl.countdownStart.toFixed(3);
    const cdE  = tl.countdownEnd.toFixed(3);
    const cdD  = COUNTDOWN_DUR;

    const filterComplex = [
      // Dark overlay over whole frame
      `[0:v]drawbox=x=0:y=0:w=iw:h=ih:color=black@0.45:t=fill[ov]`,
      // Grey bar track (visible during countdown only)
      `[ov]drawbox=x=${barX}:y=${barY}:w=${barW}:h=${barH}:color=0x404040:t=fill:enable='between(t\\,${cdS}\\,${cdE})'[v1]`,
      // Red bar filling from full to empty left-to-right countdown
      `color=c=0xFF4444:s=${barW}x${barH}:d=${DURATION},scale=eval=frame:w='if(lt(t\\,${cdS})\\,${barW}\\,if(gt(t\\,${cdE})\\,1\\,max(1\\,${barW}*(${cdE}-t)/${cdD})))':h=${barH}[bar]`,
      `[v1][bar]overlay=x=${barX}:y=${barY}:enable='between(t\\,${cdS}\\,${cdE})'[v2]`,
      // ASS subtitles on top
      `[v2]ass='${assEscaped}'[vout]`
    ].join(';');

    await execAsync(
      `ffmpeg -i "${motionPath}" -filter_complex "${filterComplex}" -map "[vout]" -map 0:a? -c:v libx264 -preset medium -crf 23 -c:a copy -t ${DURATION.toFixed(3)} -pix_fmt yuv420p -y "${baseVideoPath}"`,
      { timeout: 180000 }
    );

    try { await unlinkAsync(assPath); assPath = null; } catch (_) {}

    // 6. Mix TTS audio onto video
    finalVideoPath = join(tmpdir(), `kq-final-${renderId}-${Date.now()}.mp4`);
    await execAsync(
      `ffmpeg -i "${baseVideoPath}" -i "${audioPath}" -filter_complex "[1:a]volume=1.4[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -t ${DURATION.toFixed(3)} -y "${finalVideoPath}"`,
      { timeout: 60000 }
    );

    // 7. Upload to Supabase storage
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

    console.log(`[KidQuiz Renderer] Done render_id=${renderId} duration=${DURATION.toFixed(2)}s`);
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
