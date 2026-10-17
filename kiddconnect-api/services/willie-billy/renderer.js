/**
 * One short or one chapter: pictures, narration, ffmpeg, then a public mp4.
 */
import { spawn } from 'child_process';
import { readdir, readFile, unlink, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import { supabaseClient } from '../../config/database.js';
import { youtubeTitle } from './series.js';
import {
  chapterImagePrompts,
  chapterNarration,
  shortImagePrompts,
  shortNarration,
  youtubeDescription,
} from './prompts.js';

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET_WILLIE_BILLY || 'willie-billy-renders';
const SHORT_W = 1080;
const SHORT_H = 1920;
const CHAPTER_W = 1920;
const CHAPTER_H = 1080;
const ASSET_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const FONTS_DIR = join(ASSET_ROOT, 'assets/fonts');
const MUSIC_DIR = join(ASSET_ROOT, 'assets/willie-billy/music');
const TRACKS = [
  { file: 'carefree.mp3', title: 'Carefree' },
  { file: 'monkeys-spinning-monkeys.mp3', title: 'Monkeys Spinning Monkeys' },
  { file: 'fluffing-a-duck.mp3', title: 'Fluffing a Duck' },
  { file: 'happy-alley.mp3', title: 'Happy Alley' },
  { file: 'pixel-peeker-polka.mp3', title: 'Pixel Peeker Polka' },
];

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stderr = '';
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (err) => reject(err));
    child.on('close', (code, signal) => {
      if (code === 0) return resolve();
      const msg = signal ? `${cmd} exited with signal ${signal}` : `${cmd} exited with code ${code}`;
      reject(new Error(`${msg}${stderr ? `\n${stderr.slice(-1800)}` : ''}`));
    });
  });
}

function probeDuration(file) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      file,
    ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let out = '';
    let err = '';
    child.stdout?.on('data', (chunk) => { out += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { err += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      const n = parseFloat(out.trim());
      if (code === 0 && n > 0) return resolve(n);
      reject(new Error(`ffprobe failed${err ? `: ${err.slice(-400)}` : ''}`));
    });
  });
}

function assEscape(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\r?\n/g, ' ');
}

function escapeAssPath(filePath) {
  return filePath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

function assTime(seconds) {
  const cs = Math.max(0, Math.round(Number(seconds) * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

async function writeTitleAss(title, detail, width, height, durationSec) {
  const file = join(tmpdir(), `wb-title-${Date.now()}-${Math.random().toString(16).slice(2)}.ass`);
  const titleSize = height >= 1800 ? 58 : 44;
  const detailSize = height >= 1800 ? 34 : 26;
  const titleMargin = height >= 1800 ? 42 : 28;
  const detailMargin = titleMargin + titleSize + 10;
  const end = assTime(durationSec);
  const style = (name, font, size, margin) => (
    `Style: ${name},${font},${size},&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,3,0,8,70,70,${margin},1`
  );
  const body = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'WrapStyle: 0',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    style('Title', 'Rubik Bold', titleSize, titleMargin),
    style('Detail', 'Rubik Medium', detailSize, detailMargin),
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    `Dialogue: 0,0:00:00.00,${end},Title,,0,0,0,,${assEscape(title)}`,
    `Dialogue: 0,0:00:00.00,${end},Detail,,0,0,0,,${assEscape(detail)}`,
    '',
  ].join('\n');
  await writeFile(file, body, 'utf8');
  return file;
}

async function pickMusic() {
  const available = [];
  let names = [];
  try {
    names = await readdir(MUSIC_DIR);
  } catch {
    return null;
  }
  for (const track of TRACKS) {
    if (names.includes(track.file)) available.push(track);
  }
  if (!available.length) return null;
  const track = available[Math.floor(Math.random() * available.length)];
  return { path: join(MUSIC_DIR, track.file), title: track.title };
}

function musicCredit(title) {
  if (!title) return '';
  return [
    '',
    `Music: ${title} by Kevin MacLeod (incompetech.com)`,
    'Licensed under Creative Commons: By Attribution 4.0 License',
    'https://creativecommons.org/licenses/by/4.0/',
  ].join('\n');
}

async function mixVoiceAndMusic(voicePath, duration) {
  const track = await pickMusic();
  if (!track) return { path: voicePath, title: null };
  const mixed = join(tmpdir(), `wb-mix-${Date.now()}.mp3`);
  const fade = Math.max(0.2, duration - 1.1).toFixed(3);
  await run('ffmpeg', [
    '-i', voicePath,
    '-stream_loop', '-1', '-i', track.path,
    '-filter_complex',
    `[1:a]atrim=0:${duration.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.5,afade=t=out:st=${fade}:d=1.0,volume=0.08[m];[0:a]volume=1[v];[v][m]amix=inputs=2:duration=first:dropout_transition=0[a]`,
    '-map', '[a]',
    '-c:a', 'libmp3lame', '-b:a', '160k',
    '-y', mixed,
  ]);
  return { path: mixed, title: track.title };
}

async function generateImage(prompt, size) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set');
  const openai = new OpenAI({ apiKey: key });
  const response = await openai.images.generate({
    model: 'dall-e-3',
    prompt: String(prompt).slice(0, 3900),
    n: 1,
    size,
    quality: 'standard',
    style: /realistic photograph/i.test(prompt) ? 'natural' : 'vivid',
    response_format: 'b64_json',
  });
  const b64 = response?.data?.[0]?.b64_json;
  if (!b64) throw new Error('Image generation returned no picture');
  const file = join(tmpdir(), `wb-img-${Date.now()}-${Math.random().toString(16).slice(2)}.png`);
  await writeFile(file, Buffer.from(b64, 'base64'));
  return file;
}

async function speak(text, voice = 'fable') {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set');
  const openai = new OpenAI({ apiKey: key });
  const chunks = [];
  const clean = String(text || '').trim();
  if (!clean) throw new Error('No narration to speak');
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(i + 3500, clean.length);
    if (end < clean.length) {
      const slice = clean.slice(i, end);
      const split = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('\n'));
      if (split > 800) end = i + split + 1;
    }
    chunks.push(clean.slice(i, end));
    i = end;
  }
  const parts = [];
  try {
    for (const chunk of chunks) {
      const response = await openai.audio.speech.create({
        model: 'tts-1',
        voice,
        input: chunk,
      });
      const file = join(tmpdir(), `wb-tts-${Date.now()}-${parts.length}.mp3`);
      await writeFile(file, Buffer.from(await response.arrayBuffer()));
      parts.push(file);
    }
    if (parts.length === 1) return parts.pop();
    const list = join(tmpdir(), `wb-tts-list-${Date.now()}.txt`);
    await writeFile(list, parts.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'));
    const out = join(tmpdir(), `wb-tts-${Date.now()}.mp3`);
    await run('ffmpeg', ['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-y', out]);
    await unlink(list).catch(() => {});
    return out;
  } finally {
    await Promise.all(parts.map((p) => unlink(p).catch(() => {})));
  }
}

async function stillSegment(imagePath, seconds, width, height, title, detail) {
  const out = join(tmpdir(), `wb-seg-${Date.now()}-${Math.random().toString(16).slice(2)}.mp4`);
  const ass = await writeTitleAss(title, detail, width, height, seconds);
  const fonts = escapeAssPath(FONTS_DIR);
  const base = [
    `scale=${width}:${height}:force_original_aspect_ratio=increase`,
    `crop=${width}:${height}`,
  ];
  const args = [
    '-loop', '1', '-i', imagePath,
    '-t', Math.max(0.4, seconds).toFixed(3),
    '-r', '24',
    '-pix_fmt', 'yuv420p',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
    '-an',
    '-y', out,
  ];
  try {
    try {
      await run('ffmpeg', [
        ...args.slice(0, 4),
        '-vf', [...base, `subtitles='${escapeAssPath(ass)}':fontsdir='${fonts}'`].join(','),
        ...args.slice(4),
      ]);
    } catch (err) {
      if (!/subtitle|ass|libass/i.test(err.message)) throw err;
      await run('ffmpeg', [
        ...args.slice(0, 4),
        '-vf', base.join(','),
        ...args.slice(4),
      ]);
    }
    return out;
  } finally {
    await unlink(ass).catch(() => {});
  }
}

async function concatWithAudio(videos, audioPath, outPath) {
  const list = join(tmpdir(), `wb-concat-${Date.now()}.txt`);
  await writeFile(list, videos.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'));
  const silent = join(tmpdir(), `wb-silent-${Date.now()}.mp4`);
  try {
    await run('ffmpeg', ['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-y', silent]);
    await run('ffmpeg', [
      '-i', silent,
      '-i', audioPath,
      '-c:v', 'copy',
      '-c:a', 'aac', '-b:a', '160k',
      '-shortest',
      '-movflags', '+faststart',
      '-y', outPath,
    ]);
  } finally {
    await unlink(list).catch(() => {});
    await unlink(silent).catch(() => {});
  }
}

async function ensureBucket() {
  const { error } = await supabaseClient.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 524288000,
    allowedMimeTypes: ['video/mp4', 'image/png'],
  });
  if (error && !/already exists|duplicate/i.test(error.message || '')) {
    console.warn('[WillieBilly] Bucket create:', error.message);
  }
}

async function uploadPublic(localPath, storagePath, contentType) {
  await ensureBucket();
  const body = await readFile(localPath);
  const { error } = await supabaseClient.storage.from(BUCKET).upload(storagePath, body, {
    contentType,
    upsert: true,
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  const { data } = supabaseClient.storage.from(BUCKET).getPublicUrl(storagePath);
  return data?.publicUrl || null;
}

async function cleanup(paths) {
  await Promise.all(paths.filter(Boolean).map((p) => unlink(p).catch(() => {})));
}

export async function renderShort(row) {
  const episode = {
    day: row.day,
    slot: row.slot,
    format: row.format,
    title: row.title,
    happens: row.happens,
    episode: row.episode_number,
    week: row.week,
    chapter: row.chapter,
  };
  const narration = shortNarration(episode);
  const prompts = shortImagePrompts(episode);
  const junk = [];
  try {
    const images = [];
    for (const prompt of prompts) {
      const image = await generateImage(prompt, '1024x1792');
      images.push(image);
      junk.push(image);
    }
    const audio = await speak(narration);
    junk.push(audio);
    const duration = await probeDuration(audio);
    const mixed = await mixVoiceAndMusic(audio, duration);
    if (mixed.path !== audio) junk.push(mixed.path);
    const when = episode.slot === 'morning' ? 'Morning' : 'Night';
    const segments = [];
    const slice = duration / images.length;
    for (const image of images) {
      const seg = await stillSegment(
        image,
        slice,
        SHORT_W,
        SHORT_H,
        episode.title,
        `Day ${episode.day} ${when}  ·  Episode ${episode.episode}`,
      );
      segments.push(seg);
      junk.push(seg);
    }
    const out = join(tmpdir(), `wb-short-${row.id}.mp4`);
    junk.push(out);
    await concatWithAudio(segments, mixed.path, out);
    const stamp = Date.now();
    const videoUrl = await uploadPublic(out, `${row.business_id}/shorts/${row.episode_number}-${stamp}.mp4`, 'video/mp4');
    const imageUrl = await uploadPublic(images[images.length - 1], `${row.business_id}/stills/${row.episode_number}-${stamp}.png`, 'image/png');
    return {
      script: narration,
      video_url: videoUrl,
      image_url: imageUrl,
      youtube_title: youtubeTitle(episode),
      youtube_description: `${youtubeDescription(episode)}${musicCredit(mixed.title)}`,
    };
  } finally {
    await cleanup(junk);
  }
}

export async function renderChapter(row) {
  const narration = await chapterNarration(row.week);
  const prompts = chapterImagePrompts(row.week);
  const junk = [];
  try {
    const images = [];
    for (const prompt of prompts) {
      const image = await generateImage(prompt, '1792x1024');
      images.push(image);
      junk.push(image);
    }
    const audio = await speak(narration, 'nova');
    junk.push(audio);
    const duration = await probeDuration(audio);
    const mixed = await mixVoiceAndMusic(audio, duration);
    if (mixed.path !== audio) junk.push(mixed.path);
    const slice = duration / images.length;
    const segments = [];
    for (const image of images) {
      const seg = await stillSegment(
        image,
        slice,
        CHAPTER_W,
        CHAPTER_H,
        row.title,
        `Chapter ${row.week}`,
      );
      segments.push(seg);
      junk.push(seg);
    }
    const out = join(tmpdir(), `wb-chapter-${row.id}.mp4`);
    junk.push(out);
    await concatWithAudio(segments, mixed.path, out);
    const stamp = Date.now();
    const videoUrl = await uploadPublic(out, `${row.business_id}/chapters/${row.week}-${stamp}.mp4`, 'video/mp4');
    const imageUrl = await uploadPublic(images[0], `${row.business_id}/stills/chapter-${row.week}-${stamp}.png`, 'image/png');
    return {
      script: narration,
      video_url: videoUrl,
      image_url: imageUrl,
      youtube_title: `Chapter ${row.week} | ${row.title} | Willie & Billy`,
      youtube_description: `${narration.slice(0, 3600)}${musicCredit(mixed.title)}`,
    };
  } finally {
    await cleanup(junk);
  }
}

export async function renderWillieBilly(row) {
  if (row.kind === 'chapter') return renderChapter(row);
  return renderShort(row);
}
