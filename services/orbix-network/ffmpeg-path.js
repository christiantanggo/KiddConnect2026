/**
 * Resolve ffmpeg and ffprobe binaries so they work locally (Windows/Mac without PATH)
 * and in production (Railway with Nixpacks-installed ffmpeg).
 * Use FFMPEG_PATH / FFPROBE_PATH in .env to override (e.g. production or custom install).
 */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export const ffmpegPath =
  process.env.FFMPEG_PATH || require('@ffmpeg-installer/ffmpeg').path;

export const ffprobePath =
  process.env.FFPROBE_PATH ||
  (process.env.FFMPEG_PATH ? 'ffprobe' : require('@ffprobe-installer/ffprobe').path);
