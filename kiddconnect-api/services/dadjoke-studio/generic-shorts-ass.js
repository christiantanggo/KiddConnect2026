/**
 * Timed on-screen text for generic Dad Joke Studio shorts (vs, guess, etc.)
 * — beats align with preview logic; ASS uses bundled DejaVu (Railway has no Arial).
 */
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { existsSync, readdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Bundled fonts for libass on minimal Linux (e.g. Railway Nix). */
const ASS_FONT_FAMILY = 'DejaVu Sans';

/** Same final voice gain as Orbix Classic Loop (`dadjoke-renderer.js`). */
export const STUDIO_SHORTS_VOICE_GAIN = 1.5625;
/**
 * Music bed under longform TTS — lower than Classic’s 0.140625 so narration stays audible.
 */
export const STUDIO_SHORTS_MUSIC_BED = 0.075;

function stripEmoji(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu, '').replace(/\s+/g, ' ').trim();
}

/** Strip AI/meta cues that must not appear in burned-in subtitles (e.g. "Text on screen:"). */
export function sanitizeStudioOnScreenBeat(label, text) {
  let lab = String(label ?? '').trim();
  let txt = String(text ?? '').trim();
  const normLab = lab.replace(/\s+/g, ' ');
  if (/^(text\s*on\s*screen|on-?\s*screen\s*text)(\s*:)?\s*$/i.test(normLab)) lab = '';
  txt = txt.replace(/^\s*(text\s*on\s*screen|on-?\s*screen\s*text)\s*:\s*/i, '').trim();
  return { label: lab, text: txt };
}

function storyboardRowToPhase(x) {
  const label = String(x?.label ?? '').trim();
  const text = String(x?.text ?? x?.line ?? x?.body ?? x?.copy ?? x?.content ?? '').trim();
  return sanitizeStudioOnScreenBeat(label, text);
}

function parseContentJsonForGuess(content) {
  let cj = content?.content_json;
  if (typeof cj === 'string') {
    try {
      cj = JSON.parse(cj);
    } catch {
      cj = {};
    }
  }
  return cj && typeof cj === 'object' ? cj : {};
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripPunchlineFromString(text, punchline) {
  const p = String(punchline || '').trim();
  if (!p || text === undefined || text === null) return String(text || '').trim();
  const re = new RegExp(escapeRegExp(p), 'gi');
  return String(text).replace(re, ' ').replace(/\s+/g, ' ').trim();
}

const GUESS_FALLBACK_VO = 'Think you know the punchline? Drop it in the comments.';
const GUESS_FALLBACK_BEAT = 'COMMENT YOUR PUNCHLINE!';

/**
 * Guess-the-punchline: `content_json.punchline` is creator-only; remove it from VO and ASS beats.
 * @param {object} content — row from DB (mutate-free copy)
 */
export function viewerSafeGuessPunchlineContent(content) {
  const cj = parseContentJsonForGuess(content);
  const punchline = String(cj.punchline || '').trim();
  if (!punchline) return content;

  let script_text = stripPunchlineFromString(content.script_text || '', punchline);
  script_text = sanitizeStudioOnScreenBeat('', script_text).text;
  if (!script_text) script_text = GUESS_FALLBACK_VO;

  let sb = content.storyboard_json;
  if (typeof sb === 'string') {
    try {
      sb = JSON.parse(sb);
    } catch {
      sb = [];
    }
  }
  if (!Array.isArray(sb)) sb = [];

  const storyboard_json = sb.map((row) => {
    const label0 = String(row?.label ?? '').trim();
    const rawText = String(row?.text ?? row?.line ?? row?.body ?? row?.copy ?? row?.content ?? '').trim();
    let text = stripPunchlineFromString(rawText, punchline);
    const cleaned = sanitizeStudioOnScreenBeat(label0, text);
    let { label, text: t2 } = cleaned;
    if (!t2) t2 = GUESS_FALLBACK_BEAT;
    return { ...row, label, text: t2 };
  });

  return { ...content, script_text, storyboard_json };
}

/**
 * On-screen beats from narration only (preview + render stay in sync when the user edits Script).
 * @returns {{ label: string, text: string }[]}
 */
export function rebuildGenericStoryboardFromScript(scriptText) {
  const script = String(scriptText || '').trim();
  if (!script) return [];
  let chunks = script.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  if (chunks.length <= 1) {
    chunks = script
      .split(/(?<=[.!?])\s+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 8);
  }
  if (chunks.length === 0) chunks = [script];
  return chunks.slice(0, 14).map((t) => sanitizeStudioOnScreenBeat('', t));
}

export function buildGenericStudioPhases(content) {
  const script = String(content?.script_text || '').trim();
  if (script) {
    const fromScript = rebuildGenericStoryboardFromScript(script).filter((x) => x.text);
    if (fromScript.length > 0) return fromScript;
  }

  let sb = content?.storyboard_json;
  if (typeof sb === 'string') {
    try {
      sb = JSON.parse(sb);
    } catch {
      sb = [];
    }
  }
  if (!Array.isArray(sb)) sb = [];
  const fromBoard = sb.map(storyboardRowToPhase).filter((x) => x.text);
  if (fromBoard.length > 0) return fromBoard;

  if (!script) return [{ label: '', text: ' ' }];
  return rebuildGenericStoryboardFromScript(script);
}

/** End time in seconds for each phase (last value === durationSec), weighted by word count → closer to TTS pacing. */
function phaseEndTimesSec(phases, durationSec) {
  const n = Math.max(1, phases.length);
  const counts = phases.map((p) => {
    const t = stripEmoji(String(p?.text || '')).trim();
    const w = t.split(/\s+/).filter(Boolean).length;
    return Math.max(1, w);
  });
  const sum = counts.reduce((a, b) => a + b, 0);
  const ends = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += (durationSec * counts[i]) / sum;
    ends.push(acc);
  }
  if (n > 0) ends[n - 1] = durationSec;
  return ends;
}

function tf(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.round((sec - Math.floor(sec)) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function escAss(s) {
  return (s || '').toString().replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
}

function wrapText(text, maxChars) {
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
  return linesOut.map((l) => escAss(l)).join('\\N');
}

/**
 * Directory containing .ttf files for FFmpeg subtitles burn-in (Railway-safe).
 * @returns {string|null}
 */
export function resolveSubtitleFontsDir() {
  const candidates = [
    join(__dirname, '../../assets/fonts'),
    join(__dirname, '../assets/fonts'),
  ];
  for (const d of candidates) {
    try {
      if (existsSync(d) && readdirSync(d).some((f) => f.endsWith('.ttf'))) return d;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/**
 * @param {{ phases: { label: string, text: string }[], durationSec: number, width: number, height: number }} opts
 * @returns {Promise<string>} path to .ass file (caller deletes)
 */
export async function writeGenericStudioShortsAssFile(opts) {
  const { phases, durationSec, width, height } = opts;
  const fs = (await import('fs')).default;
  const n = Math.max(1, phases.length);
  const assPath = join(tmpdir(), `djs-generic-ass-${Date.now()}.ass`);
  const ends = phaseEndTimesSec(phases, durationSec);

  const cx = Math.round(width / 2);
  const yMain = Math.round(height * 0.48);
  const yLabel = Math.round(height * 0.36);
  const fsMain = height >= 1800 ? 64 : height >= 1000 ? 52 : 44;
  const fsLabel = Math.max(26, Math.round(fsMain * 0.45));
  const charsPerLine = Math.max(12, Math.floor((width * 0.85) / (fsMain * 0.52)));

  const PROGRESS_W = Math.round(width * 0.9);
  const PROGRESS_H = Math.max(10, Math.round(height * 0.007));
  const PROGRESS_X = Math.round((width - PROGRESS_W) / 2);
  const PROGRESS_Y = Math.round(height * 0.93);
  const pbTop = PROGRESS_Y - Math.round(PROGRESS_H / 2);
  const TRACK_BG = '&H2EFFFFFF';

  const events = [];
  events.push(
    `Dialogue: 1,${tf(0)},${tf(durationSec)},ProgressBg,,0,0,0,,{\\an7\\pos(${PROGRESS_X},${pbTop})\\p1}m 0 0 l ${PROGRESS_W} 0 l ${PROGRESS_W} ${PROGRESS_H} l 0 ${PROGRESS_H}{\\p0}`,
  );
  const nBar = Math.min(48, Math.max(12, Math.ceil(durationSec * 2)));
  for (let i = 0; i < nBar; i++) {
    const a = (durationSec * i) / nBar;
    const b = (durationSec * (i + 1)) / nBar;
    const wbar = Math.round((PROGRESS_W * (i + 1)) / nBar);
    events.push(
      `Dialogue: 2,${tf(a)},${tf(b)},ProgressFill,,0,0,0,,{\\an7\\pos(${PROGRESS_X},${pbTop})\\p1}m 0 0 l ${wbar} 0 l ${wbar} ${PROGRESS_H} l 0 ${PROGRESS_H}{\\p0}`,
    );
  }

  const ff = ASS_FONT_FAMILY;
  for (let i = 0; i < n; i++) {
    const t0 = i === 0 ? 0 : ends[i - 1];
    const t1 = ends[i];
    const ph = sanitizeStudioOnScreenBeat(phases[i]?.label, phases[i]?.text);
    const rawBody = stripEmoji(ph.text || '').toUpperCase() || ' ';
    const body = wrapText(rawBody, charsPerLine);
    if (ph.label) {
      const labRaw = stripEmoji(ph.label).toUpperCase();
      const labChars = Math.max(10, Math.floor((width * 0.85) / (fsLabel * 0.5)));
      const lab = wrapText(labRaw, labChars);
      events.push(`Dialogue: 0,${tf(t0)},${tf(t1)},Label,,0,0,0,,{\\an5\\pos(${cx},${yLabel})}${lab}`);
    }
    events.push(`Dialogue: 0,${tf(t0)},${tf(t1)},Main,,0,0,0,,{\\an5\\pos(${cx},${yMain})}${body}`);
  }

  const assHead = `[Script Info]
Title: Dad Joke Studio Generic Short
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Main,${ff},${fsMain},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,2,0,1,6,4,5,60,60,10,1
Style: Label,${ff},${fsLabel},&H00E2E8F0,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,2,0,1,5,3,5,60,60,10,1
Style: ProgressBg,${ff},12,${TRACK_BG},&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: ProgressFill,${ff},12,&H00EBEBEB,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  await fs.promises.writeFile(assPath, assHead + events.join('\n') + '\n', 'utf8');
  return assPath;
}

/** FFmpeg filter path escape (Windows drive colons + quotes). */
export function escapeAssPathForFfmpeg(p) {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

/**
 * Burn ASS with optional fontsdir so libass finds DejaVu on headless servers.
 * @param {string} escapedAssPath
 * @param {string|null} [escapedFontsDir]
 */
export function genericShortsVideoFilterChain(escapedAssPath, escapedFontsDir = null) {
  const dim =
    '[0:v]drawbox=x=0:y=0:w=iw:h=ih:color=black@0.35:t=fill[db1];[db1]drawbox=x=0:y=ih/2:w=iw:h=ih/2:color=black@0.20:t=fill[v1]';
  const subOpt =
    escapedFontsDir != null && escapedFontsDir !== ''
      ? `subtitles='${escapedAssPath}':fontsdir='${escapedFontsDir}'`
      : `subtitles='${escapedAssPath}'`;
  return `${dim};[v1]${subOpt}[vout]`;
}
