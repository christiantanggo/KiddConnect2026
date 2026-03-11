/**
 * Orbix Dad Jokes Render Pipeline
 *
 * Format:
 *   0–4s:   Joke setup on screen; AI voice reads setup
 *   4–7s:   3-2-1 countdown (large, visible)
 *   7s:     Countdown to zero, then TTS says the answer (punchline)
 *   7s–end: Punchline on screen; TTS can continue over CTA
 *   last 1.5s: rotating CTA (e.g. "Rate this dad joke 1-10") then loop
 *
 * Total: variable (min 8s). Video length = TTS content end + CTA; no hard 8s stop.
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
import { updateStepStatus } from './render-steps.js';
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
const CTA_SECONDS    = 1.5;   // call-to-action at end
const AUDIO_CAP_SEC  = 30;    // generate audio with this cap so TTS is never cut; we trim to actual duration when mixing

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

  const punchlineEnd = opts.punchlineEnd ?? COUNTDOWN_END + 1;
  const loopEnd = opts.loopEnd ?? COUNTDOWN_END + 2;

  const { getDadJokeCta } = await import('./dad-joke-cta.js');
  const episodeIndex = opts.episode_number ?? 0;
  const defaultCta = getDadJokeCta(episodeIndex);
  const setupText = (opts.setup || '').trim().toUpperCase();
  const punchlineText = (opts.punchline || '').trim().toUpperCase();
  const loopLine = (opts.loopLine || defaultCta).trim();

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
Style: LoopTrigger,Arial,52,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,3,1,5,60,60,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const lines = [];
  lines.push(`Dialogue: 0,${t(SETUP_START)},${t(COUNTDOWN_END)},Setup,,0,0,0,,{\\an5\\pos(540,640)}${wrappedSetup}`);
  lines.push(`Dialogue: 1,${t(SETUP_END)},${t(COUNTDOWN_END)},ProgressBg,,0,0,0,,{\\an7\\pos(${PROGRESS_X},${pbTop})\\p1}m 0 0 l ${PROGRESS_W} 0 l ${PROGRESS_W} ${PROGRESS_H} l 0 ${PROGRESS_H}{\\p0}`);
  for (const kf of progressKeyframes) {
    lines.push(`Dialogue: 2,${t(kf.start)},${t(kf.end)},ProgressFill,,0,0,0,,{\\an7\\pos(${PROGRESS_X},${pbTop})\\p1}m 0 0 l ${kf.fillW} 0 l ${kf.fillW} ${PROGRESS_H} l 0 ${PROGRESS_H}{\\p0}`);
  }
  for (const seg of countdownSegments) {
    lines.push(`Dialogue: 3,${t(seg.start)},${t(seg.end)},CountdownNum,,0,0,0,,{\\an5\\pos(540,${COUNTDOWN_NUM_Y})}${seg.digit}`);
  }
  lines.push(`Dialogue: 4,${t(COUNTDOWN_END)},${t(punchlineEnd)},Punchline,,0,0,0,,{\\an5\\pos(540,960)}${esc(punchlineText)}`);
  lines.push(`Dialogue: 0,${t(punchlineEnd)},${t(loopEnd)},LoopTrigger,,0,0,0,,{\\an5\\pos(540,960)}${esc(loopLine)}`);

  await fs.promises.writeFile(assPath, assContent + lines.join('\n') + '\n', 'utf8');
  return assPath;
}

export async function processDadJokeRenderJob(render, story, script) {
  const renderId = render.id;
  const businessId = render.business_id;

  writeProgressLog('DADJOKE_RENDER_START', { renderId });
  setCurrentRender(renderId, 'DADJOKE_RENDER');
  await updateStepStatus(renderId, 'DADJOKE_RENDER', 0);

  const content = script?.content_json
    ? (typeof script.content_json === 'string' ? JSON.parse(script.content_json) : script.content_json)
    : {};
  const { getDadJokeCta } = await import('./dad-joke-cta.js');
  const episodeIndex = content?.episode_number ?? 0;
  const defaultCta = getDadJokeCta(episodeIndex);
  const setup = stripEmoji((content?.setup || '').trim().slice(0, 200));
  const punchline = stripEmoji((content?.punchline || '').trim().slice(0, 100));
  const voice_script = stripEmoji((content?.voice_script || setup).trim().slice(0, 300));
  const hook = stripEmoji((content?.hook || defaultCta).trim());

  if (!setup || !punchline) {
    throw new Error(`Dad joke render missing content: setup="${setup}" punchline="${punchline}"`);
  }

  const backgroundStoragePath = render.background_storage_path ?? null;
  const backgroundId = render.background_id ?? 1;
  let bgPath, motionPath, audioPath, musicPath, baseVideoPath, finalVideoPath, assPath, simpleAssPath;

  try {
    const axios = (await import('axios')).default;
    const fs = (await import('fs')).default;

    // Generate audio first so we know how long the TTS runs. Answer starts at 7s (after countdown to zero).
    const audioResult = await generateTriviaAudio(
      { hook: null, question: voice_script, answerText: punchline, enableIntroHook: false, answerStartSeconds: 7 },
      AUDIO_CAP_SEC
    );
    audioPath = audioResult.audioPath;
    const contentEndSeconds = audioResult.contentEndSeconds ?? COUNTDOWN_END;
    const DURATION = Math.max(MIN_DURATION, Math.ceil((contentEndSeconds + CTA_SECONDS) * 2) / 2);
    const punchlineEnd = DURATION - CTA_SECONDS;
    const loopEnd = DURATION;

    const imageUrl = await getBackgroundImageUrl(backgroundId, backgroundStoragePath);
    bgPath = join(tmpdir(), `dadjoke-bg-${renderId}-${Date.now()}.png`);
    const imgResp = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
    await fs.promises.writeFile(bgPath, imgResp.data);

    motionPath = await applyMotionToImage(bgPath, DURATION);
    await updateStepStatus(renderId, 'DADJOKE_RENDER', 40);

    assPath = await generateDadJokeASSFile({ setup, punchline, loopLine: hook, punchlineEnd, loopEnd, episode_number: episodeIndex });
    simpleAssPath = join(tmpdir(), `dadjoke-ass-${renderId}-${Date.now()}.ass`);
    await fs.promises.copyFile(assPath, simpleAssPath);
    const escapedAssPath = simpleAssPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");

    baseVideoPath = join(tmpdir(), `dadjoke-base-${renderId}-${Date.now()}.mp4`);
    const filterComplex = `[0:v]drawbox=x=0:y=0:w=iw:h=ih:color=black@0.22:t=fill[v1];[v1]ass='${escapedAssPath}'[vout]`;
    await execAsync(
      `ffmpeg -i "${motionPath}" -filter_complex "${filterComplex}" -map "[vout]" -map 0:a? -c:v libx264 -preset medium -crf 23 -c:a copy -t ${DURATION} -pix_fmt yuv420p -y "${baseVideoPath}"`,
      { timeout: 120000 }
    );
    try { await unlinkAsync(assPath); } catch (_) {}
    try { await unlinkAsync(simpleAssPath); } catch (_) {}

    finalVideoPath = join(tmpdir(), `dadjoke-final-${renderId}-${Date.now()}.mp4`);
    const storyChannelId = story?.channel_id ?? null;
    const channelId = await resolveDadJokeMusicChannelId(businessId, storyChannelId);
    const musicTrack = await getRandomMusicTrack(businessId, channelId);
    if (musicTrack) musicPath = await prepareMusicTrack(musicTrack.url, DURATION);

    // Trim generated audio (AUDIO_CAP_SEC long) to DURATION, then mix with optional music
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
    await updateStepStatus(renderId, 'DADJOKE_RENDER', 80);

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
    for (const p of [bgPath, motionPath, audioPath, musicPath, baseVideoPath, finalVideoPath, assPath, simpleAssPath].filter(Boolean)) {
      try { await unlinkAsync(p); } catch (_) {}
    }
  }
}
