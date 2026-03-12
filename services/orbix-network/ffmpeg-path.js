/**
 * FFmpeg/ffprobe binary path — use env override or bundled binary (no PATH required).
 */
import { createRequire } from 'module';
import { existsSync } from 'fs';

const require = createRequire(import.meta.url);

let _ffmpegPath = process.env.FFMPEG_PATH;
let _ffprobePath = process.env.FFPROBE_PATH;

if (!_ffmpegPath) {
  try {
    _ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
    if (!existsSync(_ffmpegPath)) {
      throw new Error(`Bundled FFmpeg not found at ${_ffmpegPath}. Run: npm install`);
    }
  } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') throw new Error('Run: npm install (missing @ffmpeg-installer/ffmpeg)');
    throw e;
  }
}

if (!_ffprobePath) {
  _ffprobePath = process.env.FFMPEG_PATH ? 'ffprobe' : require('@ffprobe-installer/ffprobe').path;
  if (!process.env.FFMPEG_PATH && !existsSync(_ffprobePath)) {
    throw new Error(`Bundled ffprobe not found at ${_ffprobePath}. Run: npm install`);
  }
}

export const ffmpegPath = _ffmpegPath;
export const ffprobePath = _ffprobePath;
