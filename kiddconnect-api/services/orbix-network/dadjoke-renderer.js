/**
 * Orbix Dad Jokes Render Pipeline
 *
 * Format:
 *   0–4s:   AI voice reads setup
 *   0–7s:   Joke setup on screen through 3-2-1; removed when punchline flashes
 *   4–7s:   Countdown numbers + progress (setup text still visible)
 *   7s:     Punchline text-only flash (not spoken)
 *   7–7.5s: Punchline on screen only (~0.5s flash)
 *
 * Total: max(min length, punchline flash end, setup TTS end). No separate punchline voice track.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { unlink } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
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

/** Remove emoji so ASS/TTS display and speak cleanly. */
function stripEmoji(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu, '').replace(/\s+/g, ' ').trim();
}

const SETUP_START    = 0;
const SETUP_END      = 4.0;   // setup on screen 0–4s
const COUNTDOWN_END  = 7.0;   // 3-2-1: 4s → 7s; answer TTS starts at 7s (after countdown)
const MIN_DURATION   = 8;     // minimum video length
/** Punchline subtitle window after countdown (YouTube loop: brief flash, then end). */
const PUNCHLINE_ON_SCREEN_SEC = 0.5;
const AUDIO_CAP_SEC  = 30;    // generate audio with this cap so TTS is never cut; we trim to DURATION when mixing

/** Resolve channel for dad joke music: use the channel that has the DAD_JOKE_GENERATOR source so music comes from the dad joke channel, not trivia. */
async function resolveDadJokeMusicChannelId(businessId, storyChannelId) {
  try {
    const { data: sources, error } = await supabaseClient
      .from('orbix_sources')
      .select('channel_id')
      .eq('business_id', businessId)
      .eq('type', 'DAD_JOKE_GENERATOR')
      .eq('enabled', true)
      .not('channel_id', 'is', null)
      .limit(1);
    if (!error && sources?.length && sources[0].channel_id) {
      return sources[0].channel_id;
    }
  } catch (e) {
    // ignore
  }
  return storyChannelId;
}

async function generateDadJokeASSFile(opts) {
  const fs = (await import('fs')).default;
  const assPath = join(tmpdir(), `orbix-dadjoke-${Date.now()}.ass`);
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

  const punchlineEnd = opts.punchlineEnd ?? COUNTDOWN_END + PUNCHLINE_ON_SCREEN_SEC;

  const setupText = (opts.setup || '').trim().toUpperCase();
  const punchlineText = (opts.punchline || '').trim().toUpperCase();

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
  const setupFontSize = 72;
  const punchlineFontSize = 84;
  const charsPerLineSetup = Math.floor(900 / (setupFontSize * 0.5));
  const wrappedSetup = wrapText(setupText, charsPerLineSetup);

  const PROGRESS_W = 900;
  const PROGRESS_H = 14;
  const PROGRESS_X = (1080 - PROGRESS_W) / 2;
  const PROGRESS_Y = 1600;
  const pbTop = PROGRESS_Y - Math.round(PROGRESS_H / 2);
  const COUNTDOWN_NUM_Y = PROGRESS_Y - 70;

  const countdownSegments = [
    { digit: '3', start: SETUP_END,       end: SETUP_END + 1.0 },
    { digit: '2', start: SETUP_END + 1.0, end: SETUP_END + 2.0 },
    { digit: '1', start: SETUP_END + 2.0, end: COUNTDOWN_END }
  ];
  const progressKeyframes = [
    { start: SETUP_END,       end: SETUP_END + 1.0, fillW: PROGRESS_W },
    { start: SETUP_END + 1.0, end: SETUP_END + 2.0, fillW: Math.round(PROGRESS_W * 2 / 3) },
    { start: SETUP_END + 2.0, end: COUNTDOWN_END,    fillW: Math.round(PROGRESS_W * 1 / 3) }
  ];

  const assContent = `[Script Info]
Title: Orbix Dad Joke
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Setup,Arial,${setupFontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,2,0,1,4,2,5,60,60,10,1
Style: ProgressBg,Arial,12,&H44FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: ProgressFill,Arial,12,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: CountdownNum,Arial,130,&H00FFFF00,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,5,3,5,80,80,10,1
Style: Punchline,Arial,${punchlineFontSize},&H00FFFF00,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,5,3,5,80,80,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const lines = [];
  // Setup on screen through countdown; punchline replaces it from 7s (see header comment).
  lines.push(`Dialogue: 0,${t(SETUP_START)},${t(COUNTDOWN_END)},Setup,,0,0,0,,{\\an5\\pos(540,640)}${wrappedSetup}`);
  lines.push(`Dialogue: 1,${t(SETUP_END)},${t(COUNTDOWN_END)},ProgressBg,,0,0,0,,{\\an7\\pos(${PROGRESS_X},${pbTop})\\p1}m 0 0 l ${PROGRESS_W} 0 l ${PROGRESS_W} ${PROGRESS_H} l 0 ${PROGRESS_H}{\\p0}`);
  for (const kf of progressKeyframes) {
    lines.push(`Dialogue: 2,${t(kf.start)},${t(kf.end)},ProgressFill,,0,0,0,,{\\an7\\pos(${PROGRESS_X},${pbTop})\\p1}m 0 0 l ${kf.fillW} 0 l ${kf.fillW} ${PROGRESS_H} l 0 ${PROGRESS_H}{\\p0}`);
  }
  for (const seg of countdownSegments) {
    lines.push(`Dialogue: 3,${t(seg.start)},${t(seg.end)},CountdownNum,,0,0,0,,{\\an5\\pos(540,${COUNTDOWN_NUM_Y})}${seg.digit}`);
  }
  lines.push(`Dialogue: 4,${t(COUNTDOWN_END)},${t(punchlineEnd)},Punchline,,0,0,0,,{\\an5\\pos(540,960)}${esc(punchlineText)}`);

  await fs.promises.writeFile(assPath, assContent + lines.join('\n') + '\n', 'utf8');
  return assPath;
}

/**
 * Dad Joke Studio dashboard preview — mirrors `DadJokeClassicLoopPreview` in kiddconnect-web:
 * gradient dim via FFmpeg; text centered in upper ~86% frame; 3-2-1 + "Get ready…"; bottom ~90% width bar;
 * punchline flash; end-phase CTA line like preview `phase === 'cta'`.
 */
async function generateDashboardStyleDadJokeASSFile(opts) {
  const fs = (await import('fs')).default;
  const assPath = join(tmpdir(), `djs-dashboard-dadjoke-${Date.now()}.ass`);
  const esc = (s) => (s || '').toString()
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}');

  const tf = (sec) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const cs = Math.round((sec - Math.floor(sec)) * 100);
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  };

  const punchlineEnd = opts.punchlineEnd ?? COUNTDOWN_END + PUNCHLINE_ON_SCREEN_SEC;
  const loopEnd = opts.loopEnd ?? COUNTDOWN_END + PUNCHLINE_ON_SCREEN_SEC + 1;

  const setupText = (opts.setup || '').trim().toUpperCase();
  const punchlineText = (opts.punchline || '').trim().toUpperCase();
  const ctaRaw = String(opts.ctaText || '').trim();
  const ctaText = ctaRaw.toUpperCase();

  const wrapText = (text, maxChars) => {
    const words = (text || '').split(/\s+/).filter(Boolean);
    const linesOut = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (next.length <= maxChars) cur = next;
      else {
        if (cur) linesOut.push(cur);
        cur = w;
      }
    }
    if (cur) linesOut.push(cur);
    return linesOut.map((l) => esc(l)).join('\\N');
  };

  // Setup centered 0–4s; during countdown digit is upper (Y_COUNT) so setup moves down 4–7s — BigNum layer would cover same Y as punch.
  const Y_SETUP_SOLO = 930;
  const Y_SETUP_WITH_COUNT = 1100;
  const Y_PUNCH = 930;
  const Y_COUNT = 560;
  const Y_HINT = 720;
  const setupFontSize = 76;
  const punchlineFontSize = 90;
  const bigNumSize = 168;
  const ctaFontSize = 54;
  const charsPerLineSetup = Math.floor(900 / (setupFontSize * 0.5));
  const wrappedSetup = wrapText(setupText, charsPerLineSetup);
  const wrappedPunch = wrapText(punchlineText, Math.floor(900 / (punchlineFontSize * 0.45)));
  const wrappedCta = ctaText ? wrapText(ctaText, Math.floor(900 / (ctaFontSize * 0.52))) : '';

  const PROGRESS_W = 972;
  const PROGRESS_H = 14;
  const PROGRESS_X = Math.round((1080 - PROGRESS_W) / 2);
  const PROGRESS_Y = 1871;
  const pbTop = PROGRESS_Y - Math.round(PROGRESS_H / 2);
  const TRACK_BG = '&H2EFFFFFF';

  const pushGrowingBar = (arr, t0, t1, nSeg) => {
    const dur = t1 - t0;
    if (dur <= 0 || nSeg < 1) return;
    for (let i = 0; i < nSeg; i++) {
      const a = t0 + (dur * i) / nSeg;
      const b = t0 + (dur * (i + 1)) / nSeg;
      const w = Math.round((PROGRESS_W * (i + 1)) / nSeg);
      arr.push(
        `Dialogue: 2,${tf(a)},${tf(b)},ProgressFill,,0,0,0,,{\\an7\\pos(${PROGRESS_X},${pbTop})\\p1}m 0 0 l ${w} 0 l ${w} ${PROGRESS_H} l 0 ${PROGRESS_H}{\\p0}`,
      );
    }
  };

  const assHead = `[Script Info]
Title: Dad Joke Studio Dashboard
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Main,Arial,${setupFontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,2,0,1,6,4,5,60,60,10,1
Style: BigNum,Arial,${bigNumSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,8,5,5,80,80,10,1
Style: Punch,Arial,${punchlineFontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,6,4,5,80,80,10,1
Style: Cta,Arial,${ctaFontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,2,0,1,5,3,5,60,60,10,1
Style: Hint,Arial,36,&H00E6E6E6,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,4,3,5,60,60,10,1
Style: ProgressBg,Arial,12,${TRACK_BG},&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: ProgressFill,Arial,12,&H00EBEBEB,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = [];
  events.push(
    `Dialogue: 1,${tf(0)},${tf(loopEnd)},ProgressBg,,0,0,0,,{\\an7\\pos(${PROGRESS_X},${pbTop})\\p1}m 0 0 l ${PROGRESS_W} 0 l ${PROGRESS_W} ${PROGRESS_H} l 0 ${PROGRESS_H}{\\p0}`,
  );

  pushGrowingBar(events, 0, SETUP_END, 8);
  pushGrowingBar(events, SETUP_END, COUNTDOWN_END, 9);
  const punchDur = Math.max(0.01, punchlineEnd - COUNTDOWN_END);
  const punchSegs = Math.max(3, Math.min(12, Math.round(punchDur * 6)));
  pushGrowingBar(events, COUNTDOWN_END, punchlineEnd, punchSegs);
  events.push(
    `Dialogue: 2,${tf(punchlineEnd)},${tf(loopEnd)},ProgressFill,,0,0,0,,{\\an7\\pos(${PROGRESS_X},${pbTop})\\p1}m 0 0 l ${PROGRESS_W} 0 l ${PROGRESS_W} ${PROGRESS_H} l 0 ${PROGRESS_H}{\\p0}`,
  );

  events.push(`Dialogue: 0,${tf(SETUP_START)},${tf(SETUP_END)},Main,,0,0,0,,{\\an5\\pos(540,${Y_SETUP_SOLO})}${wrappedSetup}`);
  events.push(`Dialogue: 0,${tf(SETUP_END)},${tf(COUNTDOWN_END)},Main,,0,0,0,,{\\an5\\pos(540,${Y_SETUP_WITH_COUNT})}${wrappedSetup}`);

  const countdownSegments = [
    { digit: '3', start: SETUP_END, end: SETUP_END + 1.0 },
    { digit: '2', start: SETUP_END + 1.0, end: SETUP_END + 2.0 },
    { digit: '1', start: SETUP_END + 2.0, end: COUNTDOWN_END },
  ];
  for (const seg of countdownSegments) {
    events.push(
      `Dialogue: 3,${tf(seg.start)},${tf(seg.end)},BigNum,,0,0,0,,{\\an5\\pos(540,${Y_COUNT})}${seg.digit}`,
    );
  }
  events.push(
    `Dialogue: 4,${tf(SETUP_END)},${tf(COUNTDOWN_END)},Hint,,0,0,0,,{\\an5\\pos(540,${Y_HINT})}Get ready…`,
  );

  events.push(
    `Dialogue: 0,${tf(COUNTDOWN_END)},${tf(punchlineEnd)},Punch,,0,0,0,,{\\an5\\pos(540,${Y_PUNCH})}${wrappedPunch}`,
  );

  if (wrappedCta && loopEnd > punchlineEnd + 0.02) {
    events.push(
      `Dialogue: 0,${tf(punchlineEnd)},${tf(loopEnd)},Cta,,0,0,0,,{\\an5\\pos(540,${Y_PUNCH})}${wrappedCta}`,
    );
  }

  await fs.promises.writeFile(assPath, assHead + events.join('\n') + '\n', 'utf8');
  return assPath;
}

/**
 * Same Orbix dad-joke Short pipeline (setup 0–4s, 3-2-1 countdown 4–7s, answer at 7s, ASS overlays, motion bg, TTS mix, optional music).
 * Does not touch Supabase. Caller uploads/deletes localPath.
 *
 * @param {object} params
 * @param {string} params.businessId
 * @param {string} params.setup
 * @param {string} params.punchline
 * @param {string} [params.voice_script] - TTS for setup phase (defaults to setup)
 * @param {string} [params.hook] - reserved (end CTA overlay removed for YouTube loop)
 * @param {number} [params.episode_number]
 * @param {number} [params.backgroundId]
 * @param {string|null} [params.backgroundStoragePath] - Orbix storage path
 * @param {string|null} [params.backgroundImageUrl] - full URL (e.g. Dad Joke Studio asset); wins over backgroundId/path
 * @param {string|null} [params.musicTrackUrl] - explicit music URL; else Orbix channel music resolution
 * @param {string|null} [params.orbixChannelIdForMusic] - story.channel_id for music folder
 * @param {string} [params.tempId] - prefix for temp files
 * @returns {Promise<{ localPath: string, duration: number }>}
 */
export async function renderOrbixStyleDadJokeShortToFile(params) {
  const {
    businessId,
    setup: setupRaw,
    punchline: punchlineRaw,
    voice_script: voiceRaw,
    hook: hookRaw,
    episode_number: episodeIndex = 0,
    backgroundId = 1,
    backgroundStoragePath = null,
    backgroundImageUrl = null,
    musicTrackUrl = null,
    orbixChannelIdForMusic = null,
    tempId = `dj-${Date.now()}`,
    allowOrbixBackgroundFallback = true,
    allowOrbixMusicFallback = true,
    /** 'orbix' = legacy ASS; 'dashboard' = match Dad Joke Studio web preview */
    assStyle = 'orbix',
  } = params;

  const setup = stripEmoji((setupRaw || '').trim().slice(0, 200));
  const punchline = stripEmoji((punchlineRaw || '').trim().slice(0, 100));
  const voice_script = stripEmoji((voiceRaw || setup).trim().slice(0, 300));

  if (!setup || !punchline) {
    throw new Error(`Dad joke render missing content: setup="${setup}" punchline="${punchline}"`);
  }

  let bgPath, motionPath, audioPath, musicPath, baseVideoPath, finalVideoPath, assPath, simpleAssPath;

  try {
    const axios = (await import('axios')).default;
    const fs = (await import('fs')).default;

    const audioResult = await generateTriviaAudio(
      { hook: null, question: voice_script, answerText: '', enableIntroHook: false, answerStartSeconds: 7 },
      AUDIO_CAP_SEC
    );
    audioPath = audioResult.audioPath;
    const contentEndSeconds = audioResult.contentEndSeconds ?? 0;
    const punchlineFlashEnd = COUNTDOWN_END + PUNCHLINE_ON_SCREEN_SEC;
    const DURATION = Math.max(MIN_DURATION, punchlineFlashEnd, Math.ceil(contentEndSeconds * 2) / 2);
    const punchlineEnd = punchlineFlashEnd;
    const loopEnd = DURATION;

    bgPath = join(tmpdir(), `dadjoke-bg-${tempId}.png`);
    if (backgroundImageUrl && String(backgroundImageUrl).trim()) {
      const imgResp = await axios.get(String(backgroundImageUrl).split('?')[0], { responseType: 'arraybuffer', timeout: 30000 });
      await fs.promises.writeFile(bgPath, imgResp.data);
    } else if (allowOrbixBackgroundFallback) {
      const imageUrl = await getBackgroundImageUrl(backgroundId, backgroundStoragePath);
      const imgResp = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
      await fs.promises.writeFile(bgPath, imgResp.data);
    } else {
      throw new Error('Background image URL is required (module uses Dad Joke Studio assets only).');
    }

    motionPath = await applyMotionToImage(bgPath, DURATION);

    let assOpts = { setup, punchline, punchlineEnd, loopEnd };
    if (assStyle === 'dashboard') {
      const { getDadJokeCta } = await import('./dad-joke-cta.js');
      const ctaText = stripEmoji((hookRaw || getDadJokeCta(episodeIndex)).trim()).slice(0, 200);
      assOpts = { ...assOpts, ctaText };
    }
    assPath =
      assStyle === 'dashboard'
        ? await generateDashboardStyleDadJokeASSFile(assOpts)
        : await generateDadJokeASSFile(assOpts);
    simpleAssPath = join(tmpdir(), `dadjoke-ass-${tempId}.ass`);
    await fs.promises.copyFile(assPath, simpleAssPath);
    const escapedAssPath = simpleAssPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");

    baseVideoPath = join(tmpdir(), `dadjoke-base-${tempId}.mp4`);
    // Dashboard: match preview linear-gradient (~35% top → ~55% bottom) via stacked drawboxes; Orbix: light vignette.
    const filterComplex =
      assStyle === 'dashboard'
        ? `[0:v]drawbox=x=0:y=0:w=iw:h=ih:color=black@0.35:t=fill[db1];[db1]drawbox=x=0:y=ih/2:w=iw:h=ih/2:color=black@0.20:t=fill[v1];[v1]ass='${escapedAssPath}'[vout]`
        : `[0:v]drawbox=x=0:y=0:w=iw:h=ih:color=black@0.22:t=fill[v1];[v1]ass='${escapedAssPath}'[vout]`;
    await execAsync(
      `ffmpeg -i "${motionPath}" -filter_complex "${filterComplex}" -map "[vout]" -map 0:a? -c:v libx264 -preset medium -crf 23 -c:a copy -t ${DURATION} -pix_fmt yuv420p -y "${baseVideoPath}"`,
      { timeout: 120000 }
    );
    try { await unlinkAsync(assPath); } catch (_) {}
    try { await unlinkAsync(simpleAssPath); } catch (_) {}

    finalVideoPath = join(tmpdir(), `dadjoke-final-${tempId}.mp4`);
    if (musicTrackUrl && String(musicTrackUrl).trim()) {
      musicPath = await prepareMusicTrack(String(musicTrackUrl).split('?')[0], DURATION);
    } else if (allowOrbixMusicFallback) {
      const channelId = await resolveDadJokeMusicChannelId(businessId, orbixChannelIdForMusic);
      const musicTrack = await getRandomMusicTrack(businessId, channelId);
      if (musicTrack) musicPath = await prepareMusicTrack(musicTrack.url, DURATION);
    }

    const voiceTrim = `[1:a]atrim=0:${DURATION},asetpts=PTS-STARTPTS,volume=1.5625`;
    if (musicPath) {
      await execAsync(
        `ffmpeg -i "${baseVideoPath}" -i "${audioPath}" -i "${musicPath}" -filter_complex "${voiceTrim}[voice];[2:a]volume=0.140625[music];[voice][music]amix=inputs=2:duration=first:dropout_transition=2[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -t ${DURATION} -y "${finalVideoPath}"`,
        { timeout: 60000 }
      );
    } else {
      await execAsync(
        `ffmpeg -i "${baseVideoPath}" -i "${audioPath}" -filter_complex "${voiceTrim}[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -t ${DURATION} -y "${finalVideoPath}"`,
        { timeout: 60000 }
      );
    }

    for (const p of [bgPath, motionPath, baseVideoPath, audioPath, musicPath].filter(Boolean)) {
      try { await unlinkAsync(p); } catch (_) {}
    }

    return { localPath: finalVideoPath, duration: DURATION };
  } catch (error) {
    for (const p of [bgPath, motionPath, audioPath, musicPath, baseVideoPath, finalVideoPath, assPath, simpleAssPath].filter(Boolean)) {
      try { await unlinkAsync(p); } catch (_) {}
    }
    throw error;
  }
}

export async function processDadJokeRenderJob(render, story, script) {
  const renderId = render.id;
  const businessId = render.business_id;

  writeProgressLog('DADJOKE_RENDER_START', { renderId });
  setCurrentRender(renderId, 'DADJOKE_RENDER');

  const content = script?.content_json
    ? (typeof script.content_json === 'string' ? JSON.parse(script.content_json) : script.content_json)
    : {};
  const episodeIndex = content?.episode_number ?? 0;
  const setup = stripEmoji((content?.setup || '').trim().slice(0, 200));
  const punchline = stripEmoji((content?.punchline || '').trim().slice(0, 100));
  const voice_script = stripEmoji((content?.voice_script || setup).trim().slice(0, 300));
  const { getDadJokeCta } = await import('./dad-joke-cta.js');
  const defaultCta = getDadJokeCta(episodeIndex);
  const hook = stripEmoji((content?.hook || defaultCta).trim());

  if (!setup || !punchline) {
    throw new Error(`Dad joke render missing content: setup="${setup}" punchline="${punchline}"`);
  }

  let finalVideoPath;

  try {
    const { localPath } = await renderOrbixStyleDadJokeShortToFile({
      businessId,
      setup,
      punchline,
      voice_script,
      hook,
      episode_number: episodeIndex,
      backgroundId: render.background_id ?? 1,
      backgroundStoragePath: render.background_storage_path ?? null,
      musicTrackUrl: null,
      orbixChannelIdForMusic: story?.channel_id ?? null,
      tempId: String(renderId),
    });
    finalVideoPath = localPath;

    const { title, description, hashtags } = buildYouTubeMetadata(story, script, renderId);
    await supabaseClient.from('orbix_renders').update({
      youtube_title: title,
      youtube_description: description,
      hashtags,
      render_step: 'DADJOKE_RENDER',
      step_progress: 100,
      step_completed_at: new Date().toISOString()
    }).eq('id', renderId);

    const storageUrl = await uploadRenderToStorage(businessId, renderId, finalVideoPath);
    if (!storageUrl) throw new Error('Storage upload failed');
    await supabaseClient.from('orbix_renders').update({
      render_status: 'READY_FOR_UPLOAD',
      output_url: storageUrl,
      step_error: null,
      updated_at: new Date().toISOString()
    }).eq('id', renderId);

    writeProgressLog('DADJOKE_RENDER_DONE', { renderId, url: storageUrl });
    return { status: 'RENDER_COMPLETE', outputUrl: storageUrl, renderId };
  } catch (error) {
    console.error(`[Dad Joke Renderer] FAILED render_id=${renderId}`, error.message);
    await supabaseClient.from('orbix_renders').update({
      render_status: 'STEP_FAILED',
      step_error: error.message,
      updated_at: new Date().toISOString()
    }).eq('id', renderId);
    throw error;
  } finally {
    if (finalVideoPath) {
      try { await unlinkAsync(finalVideoPath); } catch (_) {}
    }
  }
}
