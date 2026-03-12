/**
 * FFmpeg/ffprobe binary path — use env override or bundled binary (no PATH required).
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

export const ffmpegPath =
  process.env.FFMPEG_PATH || require('@ffmpeg-installer/ffmpeg').path;
export const ffprobePath =
  process.env.FFPROBE_PATH ||
  (process.env.FFMPEG_PATH ? 'ffprobe' : require('@ffprobe-installer/ffprobe').path);
