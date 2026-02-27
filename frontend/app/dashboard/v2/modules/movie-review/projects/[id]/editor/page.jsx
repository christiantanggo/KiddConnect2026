'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import {
  Mic, MicOff, Play, Pause, Trash2, Upload, Image, Music,
  Sparkles, Send, ChevronLeft, ChevronRight, Plus, X,
  GripVertical, Type, Wand2, Loader2, CheckCircle
} from 'lucide-react';

import Cookies from 'js-cookie';
import axios from 'axios';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001').replace(/\/$/, '');

function getBusinessId() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('activeBusinessId') || localStorage.getItem('businessId');
}

// Axios instance matching the pattern used by the rest of the app
const api = axios.create({ baseURL: API_URL, timeout: 60000 });
api.interceptors.request.use(cfg => {
  const token = Cookies.get('token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  const biz = getBusinessId();
  if (biz) cfg.headers['X-Active-Business-Id'] = biz;
  return cfg;
});

const STEPS = ['Voice', 'Images', 'Timeline', 'AI'];
const MOTION_PRESETS = ['ZOOM_IN','ZOOM_OUT','PAN_LEFT','PAN_RIGHT'];
const POSITION_PRESETS = ['TOP','CENTER','BOTTOM'];

// ─── Step progress bar ────────────────────────────────────────────────────────
function StepBar({ step, steps, onStep }) {
  return (
    <div className="flex items-center mb-4" style={{ gap: 2, minWidth: 0 }}>
      {steps.map((s, i) => {
        const active = i === step;
        const done = i < step;
        return (
          <div key={s} className="flex items-center" style={{ flex: '1 1 0', minWidth: 0 }}>
            <button
              onClick={() => onStep(i)}
              className="flex items-center justify-center gap-1 w-full rounded-lg py-1.5 text-xs font-semibold truncate transition-all"
              style={{
                background: active ? 'linear-gradient(135deg,#e11d48,#9333ea)' : done ? 'rgba(225,29,72,0.12)' : 'var(--color-surface)',
                color: active ? '#fff' : done ? '#e11d48' : 'var(--color-text-muted)',
                border: `1px solid ${active ? 'transparent' : done ? '#fda4af' : 'var(--color-border)'}`,
                width: '100%',
              }}
            >
              {done && <CheckCircle className="w-3 h-3 flex-shrink-0" />}
              <span className="truncate">{s}</span>
            </button>
            {i < steps.length - 1 && (
              <div className="flex-shrink-0" style={{ width: 6, height: 1, background: 'var(--color-border)' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Voice recorder panel ─────────────────────────────────────────────────────
function VoicePanel({ projectId, voiceAsset, onVoiceChange }) {
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [audioError, setAudioError] = useState(null);
  const [localUrl, setLocalUrl] = useState(null);
  const [micLabel, setMicLabel] = useState(null);
  const [volume, setVolume] = useState(0);
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const monitorRef = useRef(null);
  const animFrameRef = useRef(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);

  // Load available microphones on mount
  useEffect(() => {
    async function loadDevices() {
      try {
        // Must request permission first to get device labels
        await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop()));
        const all = await navigator.mediaDevices.enumerateDevices();
        const mics = all.filter(d => d.kind === 'audioinput');
        setDevices(mics);
        if (mics.length > 0) setSelectedDeviceId(mics[0].deviceId);
      } catch (_) {}
    }
    loadDevices();
    return () => {
      if (localUrl) URL.revokeObjectURL(localUrl);
      monitorRef.current?.close().catch(() => {});
      cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  async function startRecording() {
    setError(null);
    setLocalUrl(null);
    setVolume(0);
    chunksRef.current = [];

    try {
      const constraints = {
        audio: selectedDeviceId ? { deviceId: selectedDeviceId } : true,
        video: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const track = stream.getAudioTracks()[0];
      setMicLabel(track?.label || 'Microphone');

      // Live volume meter
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      monitorRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setVolume(Math.min(100, Math.round(avg * 2)));
        animFrameRef.current = requestAnimationFrame(tick);
      };
      animFrameRef.current = requestAnimationFrame(tick);

      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;

      mr.ondataavailable = e => {
        if (e.data?.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        ctx.close().catch(() => {});
        cancelAnimationFrame(animFrameRef.current);
        setVolume(0);

        const blob = new Blob(chunksRef.current, { type: mr.mimeType });
        if (blob.size === 0) {
          setError('No audio captured.');
          return;
        }
        const url = URL.createObjectURL(blob);
        setLocalUrl(url);
        uploadRecording(blob, mr.mimeType);
      };

      mr.start(250);
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } catch (err) {
      setError('Microphone error: ' + err.message);
    }
  }

  function stopRecording() {
    clearInterval(timerRef.current);
    setRecording(false);
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== 'inactive') mr.stop();
  }

  async function uploadRecording(blob, mimeType) {
    const ext = mimeType?.includes('ogg') ? 'ogg' : mimeType?.includes('mp4') ? 'mp4' : 'webm';
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('voice', blob, `voice.${ext}`);
      const { data } = await api.post(`/api/v2/movie-review/projects/${projectId}/voice`, fd);
      onVoiceChange(data.asset);
    } catch (err) {
      setError('Upload failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setUploading(false);
    }
  }

  async function deleteVoice() {
    if (!confirm('Delete voice recording?')) return;
    setLocalUrl(null);
    setAudioError(null);
    await api.delete(`/api/v2/movie-review/projects/${projectId}/voice`);
    onVoiceChange(null);
  }

  const fmtTime = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const hasVoice = !!voiceAsset?.public_url;
  const playbackUrl = localUrl || voiceAsset?.public_url;
  const mp3Url = voiceAsset?.public_url;
  const durationSec = voiceAsset?.duration_seconds;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-5" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <h2 className="font-bold text-base mb-1" style={{ color: 'var(--color-text-main)' }}>🎙️ Voice Recording</h2>
        <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
          Record yourself talking about the movie. This will be the audio track of your Short.
        </p>

        {error && <div className="p-3 mb-3 rounded-lg text-xs" style={{ background: '#fee2e2', color: '#dc2626' }}>{error}</div>}

        {/* Microphone selector */}
        {!recording && !hasVoice && !localUrl && devices.length > 1 && (
          <div className="mb-3">
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--color-text-muted)' }}>🎙 Select Microphone</label>
            <select
              value={selectedDeviceId}
              onChange={e => setSelectedDeviceId(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-xs"
              style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-main)' }}
            >
              {devices.map(d => (
                <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${d.deviceId.slice(0,8)}`}</option>
              ))}
            </select>
          </div>
        )}

        {(hasVoice || localUrl) ? (
          <div className="space-y-3">
            <div className="rounded-xl p-3" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-xs font-medium" style={{ color: 'var(--color-text-main)' }}>
                  {uploading ? 'Saving recording…' : `Recording saved${durationSec ? ` · ${Math.round(durationSec)}s` : ''}`}
                </span>
                {uploading && <Loader2 className="w-3 h-3 animate-spin" style={{ color: '#9333ea' }} />}
              </div>
              <audio
                key={playbackUrl}
                src={playbackUrl}
                controls
                preload="auto"
                className="w-full"
                style={{ minHeight: 44 }}
                onCanPlay={() => setAudioError(null)}
                onError={e => {
                  const code = e.target?.error?.code;
                  const msgs = { 1: 'ABORTED', 2: 'NETWORK', 3: 'DECODE', 4: 'SRC_NOT_SUPPORTED' };
                  setAudioError(`Player error: ${code ? msgs[code] || code : 'unknown'}`);
                }}
              />
              {audioError && (
                <p className="text-xs mt-2" style={{ color: '#dc2626' }}>{audioError}</p>
              )}
              {mp3Url && (
                <a
                  href={mp3Url}
                  download="voice.wav"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-2 text-xs underline"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  Download to verify
                </a>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={startRecording} disabled={recording || uploading}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                style={{ border: '2px dashed var(--color-border)', color: 'var(--color-text-muted)' }}>
                🔄 Re-record
              </button>
              <button onClick={deleteVoice} className="px-4 py-2.5 rounded-xl text-sm"
                style={{ background: '#fee2e2', color: '#dc2626' }}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {recording ? (
              <div className="text-center py-4">
                <div className="inline-flex items-center gap-3 mb-3">
                  <div className="w-4 h-4 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-2xl font-bold" style={{ color: '#dc2626' }}>{fmtTime(elapsed)}</span>
                </div>
                {micLabel && <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>🎙 {micLabel}</p>}
                {/* Live volume meter */}
                <div className="mx-auto mb-3 rounded-full overflow-hidden" style={{ width: '100%', height: 10, background: 'var(--color-border)' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${volume}%`, background: volume > 10 ? '#22c55e' : '#ef4444' }} />
                </div>
                {volume <= 5 && <p className="text-xs mb-2" style={{ color: '#ef4444' }}>⚠️ No mic signal detected — check Windows Sound Settings</p>}
                <button onClick={stopRecording}
                  className="px-8 py-3 rounded-2xl font-bold text-white"
                  style={{ background: '#dc2626' }}>
                  ⏹ Stop Recording
                </button>
              </div>
            ) : (
              <button onClick={startRecording}
                className="w-full py-8 rounded-2xl font-bold text-white flex flex-col items-center gap-3"
                style={{ background: 'linear-gradient(135deg,#e11d48,#9333ea)' }}>
                <Mic className="w-10 h-10" />
                <span className="text-lg">Tap to Record</span>
              </button>
            )}
          </div>
        )}
      </div>

      <div className="rounded-2xl p-4" style={{ background: '#fef3c7', border: '1px solid #fde68a' }}>
        <p className="text-xs font-semibold mb-1" style={{ color: '#92400e' }}>💡 Tips for a great Short</p>
        <ul className="text-xs space-y-1" style={{ color: '#92400e' }}>
          <li>• Keep it under {50} seconds</li>
          <li>• Start with a strong hook — grab their attention right away!</li>
          <li>• Be energetic and enthusiastic</li>
          <li>• End with "Like and subscribe!"</li>
        </ul>
      </div>
    </div>
  );
}

// ─── Images panel ─────────────────────────────────────────────────────────────
function ImagesPanel({ projectId, images, onImagesChange }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);

  async function uploadFiles(files) {
    if (!files.length) return;
    setUploading(true); setError(null);
    try {
      const fd = new FormData();
      for (const f of files) fd.append('images', f);
      const { data } = await api.post(`/api/v2/movie-review/projects/${projectId}/images`, fd);
      onImagesChange([...images, ...data.assets]);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e) {
    e.preventDefault(); setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    uploadFiles(files);
  }

  async function deleteImage(asset) {
    if (!confirm('Remove this image?')) return;
    await api.delete(`/api/v2/movie-review/assets/${asset.id}`);
    onImagesChange(images.filter(i => i.id !== asset.id));
  }

  // Drag-to-reorder
  async function handleReorderDrop(targetIdx) {
    if (dragIdx === null || dragIdx === targetIdx) return;
    const newOrder = [...images];
    const [moved] = newOrder.splice(dragIdx, 1);
    newOrder.splice(targetIdx, 0, moved);
    onImagesChange(newOrder);
    setDragIdx(null); setDragOverIdx(null);
    // Persist order
    await api.put(`/api/v2/movie-review/projects/${projectId}/images/reorder`, { order: newOrder.map(i => i.id) });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-5" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <h2 className="font-bold text-base mb-1" style={{ color: 'var(--color-text-main)' }}>🖼️ Images</h2>
        <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
          These images will appear behind your voice on screen. Drag to reorder.
        </p>

        {error && <div className="p-3 mb-3 rounded-lg text-xs" style={{ background: '#fee2e2', color: '#dc2626' }}>{error}</div>}

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center justify-center cursor-pointer rounded-2xl transition-all"
          style={{
            border: `2px dashed ${dragOver ? '#e11d48' : 'var(--color-border)'}`,
            background: dragOver ? 'rgba(225,29,72,0.05)' : 'var(--color-background)',
            padding: '24px',
            marginBottom: images.length ? 16 : 0,
          }}
        >
          {uploading ? (
            <><Loader2 className="w-6 h-6 animate-spin mb-2" style={{ color: '#9333ea' }} /><p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Uploading…</p></>
          ) : (
            <><Image className="w-6 h-6 mb-2" style={{ color: 'var(--color-text-muted)' }} /><p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Drop images here or click to upload</p></>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
            onChange={e => uploadFiles(Array.from(e.target.files || []))} />
        </div>

        {/* Image grid */}
        {images.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {images.map((img, idx) => (
              <div key={img.id}
                draggable
                onDragStart={() => setDragIdx(idx)}
                onDragOver={e => { e.preventDefault(); setDragOverIdx(idx); }}
                onDrop={() => handleReorderDrop(idx)}
                onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                className="relative rounded-xl overflow-hidden cursor-grab"
                style={{
                  aspectRatio: '9/16',
                  border: dragOverIdx === idx ? '2px solid #e11d48' : '2px solid transparent',
                  opacity: dragIdx === idx ? 0.5 : 1,
                }}
              >
                <img src={img.public_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <div className="absolute top-1 right-1">
                  <button onClick={() => deleteImage(img)}
                    className="w-5 h-5 flex items-center justify-center rounded-full"
                    style={{ background: 'rgba(0,0,0,0.7)', color: '#fff' }}>
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <div className="absolute bottom-1 left-1 w-5 h-5 flex items-center justify-center rounded-full"
                  style={{ background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 10, fontWeight: 700 }}>
                  {idx + 1}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TikTok-style Timeline editor ─────────────────────────────────────────────
const TRACK_H = 52; // px height of each track row
const MIN_CLIP_S = 0.5; // minimum clip width in seconds

function TimelinePanel({ projectId, images, voiceAsset, timelineItems, onTimelineChange, maxDuration, onMaxDurationChange }) {
  // audioDur = the actual recorded voice length (from the <audio> element metadata)
  const [audioDur, setAudioDur] = useState(voiceAsset?.duration_seconds || null);
  // dur = total video length — user can extend this beyond the audio to show extra images
  const [dur, setDur] = useState(maxDuration || voiceAsset?.duration_seconds || 50);

  const [items, setItems] = useState(timelineItems || []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  // Playback state
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef(null);
  const rafRef = useRef(null);

  // Timeline scroll/zoom
  const [zoom, setZoom] = useState(1);
  const rulerRef = useRef(null);
  const timelineRef = useRef(null);
  const [timelineWidth, setTimelineWidth] = useState(600);

  // Drag state for clips
  const dragState = useRef(null);

  useEffect(() => { setItems(timelineItems || []); }, [timelineItems]);

  // When audio metadata loads, get the real duration from the element itself
  function onAudioMetadata() {
    const realDur = audioRef.current?.duration;
    if (realDur && isFinite(realDur)) {
      setAudioDur(realDur);
      onAudioMetadataFixed(realDur);
      // Only auto-set video dur if no explicit maxDuration has been saved
      if (!maxDuration || maxDuration === 50) {
        const rounded = parseFloat(realDur.toFixed(1));
        setDur(rounded);
      }
    }
  }

  // Save the new video end time to the project
  async function saveDuration(newDur) {
    const clamped = Math.max(1, parseFloat(newDur.toFixed(1)));
    setDur(clamped);
    try {
      await api.put(`/api/v2/movie-review/projects/${projectId}`, { max_duration_seconds: clamped });
      if (onMaxDurationChange) onMaxDurationChange(clamped);
    } catch (_) {}
  }

  useEffect(() => {
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w) setTimelineWidth(w);
    });
    if (timelineRef.current) ro.observe(timelineRef.current);
    return () => ro.disconnect();
  }, []);

  // px per second based on zoom level
  const pxPerSec = (timelineWidth / dur) * zoom;
  const totalPx = dur * pxPerSec;

  // ── Audio clip state (trimming the voice clip on the track) ─────────────
  // audioClip:
  //   start      — where on the timeline (seconds) this clip begins
  //   end        — where on the timeline (seconds) this clip ends
  //   fileStart  — how many seconds into the audio FILE to begin reading (left-trim offset)
  // The clip's visible duration = end - start
  // The file plays from fileStart to fileStart + (end - start)
  const [audioClip, setAudioClip] = useState({ start: 0, end: voiceAsset?.duration_seconds || 50, fileStart: 0 });

  // Once we get real metadata, fix the clip end if it was the placeholder 50
  function onAudioMetadataFixed(realDur) {
    setAudioClip(prev => ({
      ...prev,
      end: prev.end === 50 || prev.end > realDur ? realDur : prev.end,
    }));
  }

  // ── Playback — purely time-based RAF, audio just follows ─────────────────
  const playingRef = useRef(false); // ref so RAF closure always sees latest value
  const lastRafTs = useRef(null);

  function stopPlayback() {
    playingRef.current = false;
    cancelAnimationFrame(rafRef.current);
    setPlaying(false);
    if (audioRef.current && !audioRef.current.paused) audioRef.current.pause();
  }

  function startPlayback(fromTime) {
    const audio = audioRef.current;
    playingRef.current = true;
    setPlaying(true);
    lastRafTs.current = null;

    // Only play audio if we're inside the audio clip window
    if (audio && fromTime >= audioClip.start && fromTime < audioClip.end) {
      const offsetInFile = audioClip.fileStart + (fromTime - audioClip.start);
      audio.currentTime = Math.max(0, offsetInFile);
      audio.play().catch(() => {});
    }

    let ct = fromTime;
    const tick = (ts) => {
      if (!playingRef.current) return;
      if (lastRafTs.current !== null) {
        const delta = (ts - lastRafTs.current) / 1000;
        ct = ct + delta;
        if (ct >= dur) {
          ct = dur;
          setCurrentTime(ct);
          stopPlayback();
          return;
        }
        setCurrentTime(ct);

        // Sync audio: if we enter the audio window, start audio; if we leave, pause it
        if (audio) {
          const inAudioWindow = ct >= audioClip.start && ct < audioClip.end;
          if (inAudioWindow && audio.paused) {
            const offsetInFile = audioClip.fileStart + (ct - audioClip.start);
            audio.currentTime = Math.max(0, offsetInFile);
            audio.play().catch(() => {});
          } else if (!inAudioWindow && !audio.paused) {
            audio.pause();
          }
        }
      }
      lastRafTs.current = ts;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  async function togglePlay() {
    if (playing) {
      stopPlayback();
    } else {
      startPlayback(currentTime >= dur ? 0 : currentTime);
    }
  }

  function seekTo(t) {
    const clamped = Math.max(0, Math.min(dur, t));
    setCurrentTime(clamped);
    if (playing) stopPlayback();
    // Sync audio position to new seek point
    if (audioRef.current) {
      const inWindow = clamped >= audioClip.start && clamped < audioClip.end;
      if (inWindow) {
        const offsetInFile = audioClip.fileStart + (clamped - audioClip.start);
        const safeDur = audioDur || audioRef.current.duration || 9999;
        audioRef.current.currentTime = Math.min(safeDur - 0.01, Math.max(0, offsetInFile));
      } else if (!audioRef.current.paused) {
        audioRef.current.pause();
      }
    }
  }

  // Click on ruler to seek
  function handleRulerClick(e) {
    const rect = rulerRef.current.getBoundingClientRect();
    const scrollLeft = rulerRef.current.closest('[data-scroll]')?.scrollLeft || 0;
    const x = e.clientX - rect.left + scrollLeft;
    seekTo(x / pxPerSec);
  }

  // ── Snapping ──────────────────────────────────────────────────────────────
  // Returns the nearest snap point within SNAP_THRESHOLD seconds, or the value itself
  const SNAP_THRESHOLD_S = 0.4; // seconds within which an edge snaps

  function snapValue(value, excludeId, currentItems) {
    const snapPoints = [0, dur];
    for (const item of currentItems) {
      if (item.id === excludeId) continue;
      snapPoints.push(item.start_time, item.end_time);
    }
    let best = value;
    let bestDist = SNAP_THRESHOLD_S;
    for (const p of snapPoints) {
      const d = Math.abs(value - p);
      if (d < bestDist) { bestDist = d; best = p; }
    }
    return best;
  }

  // ── Global pointer listeners for drag ────────────────────────────────────
  // We store pxPerSec in a ref so the stable window listener always reads the latest value
  const pxPerSecRef = useRef(pxPerSec);
  useEffect(() => { pxPerSecRef.current = pxPerSec; }, [pxPerSec]);
  const durRef = useRef(dur);
  useEffect(() => { durRef.current = dur; }, [dur]);
  const audioDurRef = useRef(audioDur);
  useEffect(() => { audioDurRef.current = audioDur; }, [audioDur]);

  useEffect(() => {
    const move = (e) => {
      if (!dragState.current) return;
      handleDragMove(e.clientX);
    };
    const up = () => { dragState.current = null; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  // Stable — handleDragMove reads from refs, not closures
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Clip drag logic ───────────────────────────────────────────────────────
  function onClipPointerDown(e, itemId, type) {
    e.stopPropagation();
    const item = items.find(i => i.id === itemId);
    dragState.current = {
      type,
      itemId,
      startX: e.clientX,
      origStart: item.start_time,
      origEnd: item.end_time,
    };
  }

  function handleDragMove(clientX) {
    if (!dragState.current) return;
    // Always read live values from refs — never from closure-captured state
    const pps = pxPerSecRef.current;
    const totalDur = durRef.current;
    const maxAudioDur = audioDurRef.current;

    const { type, startX, origStart, origEnd, origFileStart, itemId } = dragState.current;
    const dx = clientX - startX;
    const dSec = dx / pps;

    // ── Audio clip drag ──────────────────────────────────────────────────────
    if (type === 'audio-move') {
      const clipLen = origEnd - origStart;
      const newStart = Math.max(0, Math.min(totalDur - clipLen, origStart + dSec));
      setAudioClip({ start: parseFloat(newStart.toFixed(2)), end: parseFloat((newStart + clipLen).toFixed(2)), fileStart: origFileStart });
      return;
    }

    if (type === 'audio-left') {
      // Drag LEFT handle RIGHT → cut beginning, right edge stays fixed
      // Drag LEFT handle LEFT → restore beginning, right edge stays fixed
      const maxShrink = origEnd - MIN_CLIP_S; // can't push start past the right edge
      const newStart = Math.max(0, Math.min(maxShrink, origStart + dSec));
      // fileStart advances by the same amount we moved start (skip that many seconds into the file)
      const fileDelta = newStart - origStart;
      const newFileStart = Math.max(0, (origFileStart || 0) + fileDelta);
      setAudioClip({ start: parseFloat(newStart.toFixed(2)), end: origEnd, fileStart: parseFloat(newFileStart.toFixed(2)) });
      return;
    }

    if (type === 'audio-right') {
      // Drag RIGHT handle LEFT → cut end, left edge stays fixed
      const maxEnd = maxAudioDur ? origStart + (maxAudioDur - (origFileStart || 0)) : totalDur;
      const newEnd = Math.min(totalDur, Math.min(maxEnd, Math.max(origStart + MIN_CLIP_S, origEnd + dSec)));
      setAudioClip({ start: origStart, end: parseFloat(newEnd.toFixed(2)), fileStart: origFileStart || 0 });
      return;
    }

    // ── Image / text clip drag ───────────────────────────────────────────────
    setItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const clipLen = origEnd - origStart;
      let start_time, end_time;

      if (type === 'move') {
        let rawStart = Math.max(0, Math.min(totalDur - clipLen, origStart + dSec));
        const snappedStart = snapValue(rawStart, itemId, prev);
        const snappedEnd = snapValue(rawStart + clipLen, itemId, prev);
        if (snappedStart !== rawStart) {
          start_time = snappedStart;
        } else if (snappedEnd !== rawStart + clipLen) {
          start_time = snappedEnd - clipLen;
        } else {
          start_time = rawStart;
        }
        start_time = Math.max(0, Math.min(totalDur - clipLen, start_time));
        end_time = start_time + clipLen;
      } else if (type === 'resize-left') {
        let rawStart = Math.max(0, Math.min(origEnd - MIN_CLIP_S, origStart + dSec));
        start_time = snapValue(rawStart, itemId, prev);
        start_time = Math.max(0, Math.min(origEnd - MIN_CLIP_S, start_time));
        end_time = origEnd;
      } else {
        let rawEnd = Math.min(totalDur, Math.max(origStart + MIN_CLIP_S, origEnd + dSec));
        end_time = snapValue(rawEnd, itemId, prev);
        end_time = Math.min(totalDur, Math.max(origStart + MIN_CLIP_S, end_time));
        start_time = origStart;
      }

      return { ...item, start_time: parseFloat(start_time.toFixed(2)), end_time: parseFloat(end_time.toFixed(2)) };
    }));
  }


  // ── Add / remove items ────────────────────────────────────────────────────
  function addImageItem(asset) {
    // Place at playhead if there's space, otherwise pack at end of last image clip
    setItems(prev => {
      const imgClips = prev.filter(i => i.type === 'IMAGE').sort((a, b) => a.start_time - b.start_time);
      // Try playhead position first
      let start = parseFloat(Math.min(currentTime, dur - MIN_CLIP_S).toFixed(2));
      // Check if another clip already covers that position — if so, pack after the last clip
      const overlaps = imgClips.some(c => c.start_time < start + 0.1 && c.end_time > start + 0.1);
      if (overlaps || imgClips.length > 0) {
        const lastEnd = imgClips.length ? imgClips[imgClips.length - 1].end_time : 0;
        start = parseFloat(Math.min(lastEnd, dur - MIN_CLIP_S).toFixed(2));
      }
      const end = parseFloat(Math.min(start + 5, dur).toFixed(2));
      return [...prev, {
        id: `tmp-${Date.now()}`,
        type: 'IMAGE',
        asset_id: asset.id,
        asset_url: asset.public_url,
        start_time: start,
        end_time: end,
        motion_preset: 'ZOOM_IN',
        position_preset: 'CENTER',
        order_index: prev.length,
      }];
    });
  }

  function addTextItem() {
    const start = parseFloat(Math.min(currentTime, dur - 3).toFixed(2));
    const end = parseFloat(Math.min(start + 3, dur).toFixed(2));
    setItems(prev => [...prev, {
      id: `tmp-${Date.now()}`,
      type: 'TEXT',
      text_content: 'Enter text here',
      start_time: start,
      end_time: end,
      position_preset: 'BOTTOM',
      motion_preset: 'ZOOM_IN',
      order_index: prev.length,
    }]);
  }

  function updateItem(id, field, value) {
    setItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  }

  function removeItem(id) {
    setItems(prev => prev.filter(item => item.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function autoDistribute() {
    if (!images.length) return;
    const segLen = dur / images.length;
    const textItems = items.filter(i => i.type === 'TEXT');
    const newImageItems = images.map((img, i) => ({
      id: `tmp-${Date.now()}-${i}`,
      type: 'IMAGE',
      asset_id: img.id,
      asset_url: img.public_url,
      start_time: parseFloat((i * segLen).toFixed(2)),
      end_time: parseFloat(((i + 1) * segLen).toFixed(2)),
      motion_preset: ['ZOOM_IN','ZOOM_OUT','PAN_LEFT','PAN_RIGHT'][i % 4],
      position_preset: 'CENTER',
      order_index: i,
    }));
    setItems([...newImageItems, ...textItems.map((t, i) => ({ ...t, order_index: newImageItems.length + i }))]);
  }

  async function saveTimeline() {
    setSaving(true);
    try {
      const payload = items.map((item, i) => ({
        id: item.id?.startsWith('tmp-') ? undefined : item.id,
        type: item.type,
        asset_id: item.asset_id || null,
        text_content: item.text_content || null,
        start_time: item.start_time,
        end_time: item.end_time,
        position_preset: item.position_preset || 'CENTER',
        motion_preset: item.motion_preset || 'ZOOM_IN',
        order_index: i,
      }));
      await api.put(`/api/v2/movie-review/projects/${projectId}/timeline`, { items: payload });
      onTimelineChange(items);
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Current frame preview ─────────────────────────────────────────────────
  const activeImageItem = items
    .filter(i => i.type === 'IMAGE' && i.start_time <= currentTime && i.end_time > currentTime)
    .sort((a, b) => b.start_time - a.start_time)[0];

  const selectedItem = items.find(i => i.id === selectedId);
  const imageItems = items.filter(i => i.type === 'IMAGE');
  const textItems = items.filter(i => i.type === 'TEXT');

  // Ruler tick marks
  const tickStep = dur <= 15 ? 1 : dur <= 60 ? 5 : 10;
  const ticks = [];
  for (let t = 0; t <= dur; t += tickStep) ticks.push(parseFloat(t.toFixed(1)));

  const fmtT = s => {
    const m = Math.floor(s / 60);
    const sec = (s % 60).toFixed(1);
    return m > 0 ? `${m}:${sec.padStart(4,'0')}` : `${parseFloat(sec).toFixed(1)}s`;
  };

  return (
    <div className="space-y-3">
      {/* Hidden audio for playback */}
      {voiceAsset?.public_url && (
        <audio ref={audioRef} src={voiceAsset.public_url} preload="auto" style={{ display: 'none' }}
          onLoadedMetadata={onAudioMetadata} />
      )}

      {/* ── Preview monitor ── */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#0f0f0f', border: '1px solid var(--color-border)', aspectRatio: '9/16', maxHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        {activeImageItem?.asset_url ? (
          <img src={activeImageItem.asset_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div className="text-center" style={{ color: '#555' }}>
            <Play className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-xs opacity-50">No image at this point</p>
          </div>
        )}
        {/* Text overlays */}
        {textItems.filter(t => t.start_time <= currentTime && t.end_time > currentTime).map(t => (
          <div key={t.id} className="absolute left-0 right-0 text-center px-3 py-1 text-white font-bold text-sm"
            style={{
              bottom: t.position_preset === 'BOTTOM' ? 12 : undefined,
              top: t.position_preset === 'TOP' ? 12 : undefined,
              inset: t.position_preset === 'CENTER' ? 'auto' : undefined,
              textShadow: '0 1px 4px rgba(0,0,0,0.9)',
              background: 'rgba(0,0,0,0.4)',
            }}>
            {t.text_content}
          </div>
        ))}
        {/* Time badge */}
        <div className="absolute top-2 right-2 text-xs px-2 py-0.5 rounded-full font-mono"
          style={{ background: 'rgba(0,0,0,0.7)', color: '#fff' }}>
          {fmtT(currentTime)} / {fmtT(dur)}
        </div>
      </div>

      {/* ── Transport controls ── */}
      <div className="flex items-center gap-3">
        <button onClick={togglePlay}
          className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full text-white"
          style={{ background: 'linear-gradient(135deg,#e11d48,#9333ea)' }}>
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>
        <input type="range" min={0} max={dur} step={0.1} value={currentTime}
          onChange={e => seekTo(parseFloat(e.target.value))}
          className="flex-1" style={{ accentColor: '#9333ea' }} />
        <span className="text-xs font-mono flex-shrink-0" style={{ color: 'var(--color-text-muted)', minWidth: 40, textAlign: 'right' }}>
          {fmtT(currentTime)}
        </span>
      </div>

      {/* ── Image library shelf ── */}
      {images.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-muted)' }}>
            Tap image to add at playhead · {fmtT(currentTime)}
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {images.map(img => (
              <button key={img.id} onClick={() => addImageItem(img)}
                className="flex-shrink-0 rounded-lg overflow-hidden relative"
                style={{ width: 44, height: 66, border: '2px solid var(--color-border)' }}>
                <img src={img.public_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                  style={{ background: 'rgba(147,51,234,0.5)' }}>
                  <Plus className="w-5 h-5 text-white" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Controls row ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={autoDistribute} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-main)' }}>
          <Wand2 className="w-3 h-3" /> Auto-fill
        </button>
        <button onClick={addTextItem} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-main)' }}>
          <Type className="w-3 h-3" /> Add Text
        </button>
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Zoom</span>
          <button onClick={() => setZoom(z => Math.max(0.5, parseFloat((z - 0.25).toFixed(2))))}
            className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-main)' }}>−</button>
          <button onClick={() => setZoom(z => Math.min(8, parseFloat((z + 0.25).toFixed(2))))}
            className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-main)' }}>+</button>
        </div>
      </div>

      {/* ── Video end time control ── */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <span className="text-xs font-semibold flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>🎬 Video ends at</span>
        <input
          type="number" min={1} max={300} step={0.5}
          value={dur}
          onChange={e => setDur(parseFloat(e.target.value) || dur)}
          onBlur={e => saveDuration(parseFloat(e.target.value) || dur)}
          className="w-16 px-2 py-0.5 rounded text-xs text-center font-mono"
          style={{ background: 'var(--color-background)', border: '1px solid var(--color-border)', color: 'var(--color-text-main)', outline: 'none' }}
        />
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>s</span>
        {audioDur && (
          <button onClick={() => saveDuration(audioDur)} className="text-xs px-2 py-0.5 rounded-lg ml-1"
            style={{ background: 'rgba(37,99,235,0.15)', color: '#60a5fa', border: '1px solid rgba(37,99,235,0.3)' }}>
            Match audio ({audioDur.toFixed(1)}s)
          </button>
        )}
        <button onClick={() => saveDuration(Math.max(dur, ...(items.map(i => i.end_time)), audioDur || 0))} className="text-xs px-2 py-0.5 rounded-lg"
          style={{ background: 'rgba(147,51,234,0.15)', color: '#c084fc', border: '1px solid rgba(147,51,234,0.3)' }}>
          Fit clips
        </button>
      </div>

      {/* ── TikTok-style timeline ── */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#111', border: '1px solid var(--color-border)' }}>
        {/* Scrollable track area */}
        <div ref={timelineRef} data-scroll style={{ overflowX: 'auto', overflowY: 'hidden', cursor: 'default' }}>

          <div style={{ width: Math.max(totalPx + 32, timelineWidth), minWidth: '100%', position: 'relative' }}>

            {/* ── Time ruler ── */}
            <div ref={rulerRef} onClick={handleRulerClick}
              style={{ height: 24, position: 'relative', background: '#1a1a1a', cursor: 'pointer', userSelect: 'none', borderBottom: '1px solid #333' }}>
              {ticks.map(t => (
                <div key={t} style={{ position: 'absolute', left: t * pxPerSec, top: 0, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                  <div style={{ width: 1, height: t % (tickStep * 2) === 0 ? 12 : 6, background: '#555', marginTop: 0 }} />
                  {t % (tickStep * 2) === 0 && (
                    <span style={{ fontSize: 9, color: '#888', marginLeft: 3, lineHeight: 1 }}>{fmtT(t)}</span>
                  )}
                </div>
              ))}
              {/* Playhead line on ruler */}
              <div style={{ position: 'absolute', top: 0, left: currentTime * pxPerSec, width: 2, height: '100%', background: '#e11d48', pointerEvents: 'none' }} />
            </div>

            {/* ── Track rows ── */}

            {/* AUDIO track */}
            <div style={{ display: 'flex', alignItems: 'center', height: TRACK_H, borderBottom: '1px solid #222', position: 'relative' }}>
              <div style={{ width: 52, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#888', fontWeight: 700, background: '#0d0d0d', height: '100%', borderRight: '1px solid #222' }}>
                🎙<br /><span style={{ fontSize: 8 }}>AUDIO</span>
              </div>
              <div style={{ flex: 1, position: 'relative', height: '100%' }}>
                {voiceAsset?.public_url ? (() => {
                  const clipW = Math.max((audioClip.end - audioClip.start) * pxPerSec, 24);
                  const clipL = audioClip.start * pxPerSec;
                  const totalAudioBars = Math.floor((audioDur || 10) * 4);
                  return (
                  <div
                    style={{ position: 'absolute', left: clipL, top: 6, width: clipW, height: TRACK_H - 12, borderRadius: 6, background: 'linear-gradient(90deg,#1e3a5f,#2563eb)', overflow: 'hidden', cursor: 'grab', userSelect: 'none', boxSizing: 'border-box', border: '2px solid rgba(96,165,250,0.5)' }}
                    onPointerDown={e => {
                      e.stopPropagation();
                      dragState.current = { type: 'audio-move', startX: e.clientX, origStart: audioClip.start, origEnd: audioClip.end, origFileStart: audioClip.fileStart };
                    }}
                    >
                    {/* Waveform bars */}
                    <div style={{ display: 'flex', gap: 1, alignItems: 'center', height: '100%', paddingInline: 10, overflow: 'hidden' }}>
                      {Array.from({ length: totalAudioBars }).map((_, i) => (
                        <div key={i} style={{ width: 2, borderRadius: 1, flexShrink: 0, height: `${20 + Math.sin(i * 0.7) * 14 + Math.cos(i * 1.3) * 10}%`, background: 'rgba(147,197,253,0.7)' }} />
                      ))}
                    </div>
                    <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#93c5fd', fontSize: 10, fontWeight: 700, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                      🎙 {(audioClip.end - audioClip.start).toFixed(1)}s
                    </span>
                    {/* Left resize */}
                    <div onPointerDown={e => { e.stopPropagation(); dragState.current = { type: 'audio-left', startX: e.clientX, origStart: audioClip.start, origEnd: audioClip.end, origFileStart: audioClip.fileStart }; }}
                      style={{ position: 'absolute', left: 0, top: 0, width: 10, height: '100%', cursor: 'ew-resize', background: 'rgba(96,165,250,0.4)', zIndex: 4 }} />
                    {/* Right resize */}
                    <div onPointerDown={e => { e.stopPropagation(); dragState.current = { type: 'audio-right', startX: e.clientX, origStart: audioClip.start, origEnd: audioClip.end, origFileStart: audioClip.fileStart }; }}
                      style={{ position: 'absolute', right: 0, top: 0, width: 10, height: '100%', cursor: 'ew-resize', background: 'rgba(96,165,250,0.4)', zIndex: 4 }} />
                  </div>
                  );
                })() : (
                  <div style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#444', fontSize: 11 }}>
                    No voice recorded
                  </div>
                )}
                {/* Playhead */}
                <div style={{ position: 'absolute', top: 0, left: currentTime * pxPerSec, width: 2, height: '100%', background: '#e11d48', pointerEvents: 'none', zIndex: 10 }} />
              </div>
            </div>

            {/* VIDEO track */}
            <div style={{ display: 'flex', alignItems: 'center', height: TRACK_H, borderBottom: '1px solid #222', position: 'relative' }}>
              <div style={{ width: 52, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#888', fontWeight: 700, background: '#0d0d0d', height: '100%', borderRight: '1px solid #222' }}>
                🖼️<br /><span style={{ fontSize: 8 }}>VIDEO</span>
              </div>
              <div style={{ flex: 1, position: 'relative', height: '100%' }}>
                {imageItems.map(item => {
                  const left = item.start_time * pxPerSec;
                  const width = Math.max((item.end_time - item.start_time) * pxPerSec, 24);
                  const isSelected = selectedId === item.id;
                  return (
                    <div key={item.id}
                      style={{ position: 'absolute', left, top: 6, width, height: TRACK_H - 12, borderRadius: 6, overflow: 'hidden', cursor: 'grab', border: isSelected ? '2px solid #e11d48' : '2px solid rgba(255,255,255,0.15)', boxSizing: 'border-box', userSelect: 'none' }}
                      onClick={e => { e.stopPropagation(); setSelectedId(isSelected ? null : item.id); }}
                      onPointerDown={e => onClipPointerDown(e, item.id, 'move')}>
                      {/* Thumbnail */}
                      {item.asset_url && (
                        <img src={item.asset_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
                      )}
                      {/* Delete button */}
                      {isSelected && (
                        <button onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); removeItem(item.id); }}
                          style={{ position: 'absolute', top: 2, right: 2, width: 16, height: 16, borderRadius: '50%', background: '#e11d48', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5 }}>
                          <X className="w-2.5 h-2.5" />
                        </button>
                      )}
                      {/* Left resize handle */}
                      <div
                        onPointerDown={e => onClipPointerDown(e, item.id, 'resize-left')}
                        style={{ position: 'absolute', left: 0, top: 0, width: 10, height: '100%', cursor: 'ew-resize', background: 'rgba(255,255,255,0.25)', zIndex: 4 }} />
                      {/* Right resize handle */}
                      <div
                        onPointerDown={e => onClipPointerDown(e, item.id, 'resize-right')}
                        style={{ position: 'absolute', right: 0, top: 0, width: 10, height: '100%', cursor: 'ew-resize', background: 'rgba(255,255,255,0.25)', zIndex: 4 }} />
                    </div>
                  );
                })}
                {imageItems.length === 0 && (
                  <div style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#444', fontSize: 11 }}>
                    Tap an image above to place it
                  </div>
                )}
                {/* Playhead */}
                <div style={{ position: 'absolute', top: 0, left: currentTime * pxPerSec, width: 2, height: '100%', background: '#e11d48', pointerEvents: 'none', zIndex: 10 }} />
              </div>
            </div>

            {/* TEXT track */}
            <div style={{ display: 'flex', alignItems: 'center', height: TRACK_H, position: 'relative' }}>
              <div style={{ width: 52, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#888', fontWeight: 700, background: '#0d0d0d', height: '100%', borderRight: '1px solid #222' }}>
                📝<br /><span style={{ fontSize: 8 }}>TEXT</span>
              </div>
              <div style={{ flex: 1, position: 'relative', height: '100%' }}>
                {textItems.map(item => {
                  const left = item.start_time * pxPerSec;
                  const width = Math.max((item.end_time - item.start_time) * pxPerSec, 32);
                  const isSelected = selectedId === item.id;
                  return (
                    <div key={item.id}
                      style={{ position: 'absolute', left, top: 6, width, height: TRACK_H - 12, borderRadius: 6, overflow: 'hidden', cursor: 'grab', border: isSelected ? '2px solid #c084fc' : '2px solid rgba(192,132,252,0.4)', background: '#2d1b4e', boxSizing: 'border-box', userSelect: 'none', display: 'flex', alignItems: 'center', paddingInline: 10 }}
                      onClick={e => { e.stopPropagation(); setSelectedId(isSelected ? null : item.id); }}
                      onPointerDown={e => onClipPointerDown(e, item.id, 'move')}>
                      <span style={{ color: '#c084fc', fontSize: 10, fontWeight: 700, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', pointerEvents: 'none', flex: 1 }}>
                        {item.text_content || 'Text'}
                      </span>
                      {isSelected && (
                        <button onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); removeItem(item.id); }}
                          style={{ width: 14, height: 14, borderRadius: '50%', background: '#e11d48', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 5 }}>
                          <X className="w-2 h-2" />
                        </button>
                      )}
                      <div onPointerDown={e => onClipPointerDown(e, item.id, 'resize-left')}
                        style={{ position: 'absolute', left: 0, top: 0, width: 8, height: '100%', cursor: 'ew-resize', zIndex: 4 }} />
                      <div onPointerDown={e => onClipPointerDown(e, item.id, 'resize-right')}
                        style={{ position: 'absolute', right: 0, top: 0, width: 8, height: '100%', cursor: 'ew-resize', zIndex: 4 }} />
                    </div>
                  );
                })}
                {textItems.length === 0 && (
                  <div style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#444', fontSize: 11 }}>
                    Use "Add Text" to place captions
                  </div>
                )}
                {/* Playhead */}
                <div style={{ position: 'absolute', top: 0, left: currentTime * pxPerSec, width: 2, height: '100%', background: '#e11d48', pointerEvents: 'none', zIndex: 10 }} />
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ── Selected clip inspector ── */}
      {selectedItem && (
        <div className="rounded-2xl p-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold" style={{ color: 'var(--color-text-main)' }}>
              {selectedItem.type === 'IMAGE' ? '🖼️ Image clip' : '📝 Text clip'} — {fmtT(selectedItem.start_time)} → {fmtT(selectedItem.end_time)}
            </span>
            <button onClick={() => removeItem(selectedItem.id)} className="text-xs px-2 py-1 rounded-lg"
              style={{ background: '#fee2e2', color: '#dc2626' }}>
              Remove
            </button>
          </div>

          {selectedItem.type === 'TEXT' && (
            <input value={selectedItem.text_content || ''} onChange={e => updateItem(selectedItem.id, 'text_content', e.target.value)}
              placeholder="Caption text…"
              className="w-full px-3 py-2 rounded-xl text-sm mb-3"
              style={{ background: 'var(--color-background)', border: '1px solid var(--color-border)', color: 'var(--color-text-main)', outline: 'none' }} />
          )}

          <div className="flex gap-3 flex-wrap">
            {selectedItem.type === 'IMAGE' && (
              <div className="flex-1 min-w-0">
                <label className="text-xs mb-1 block" style={{ color: 'var(--color-text-muted)' }}>Motion</label>
                <select value={selectedItem.motion_preset} onChange={e => updateItem(selectedItem.id, 'motion_preset', e.target.value)}
                  className="w-full text-xs rounded-lg px-2 py-1.5"
                  style={{ background: 'var(--color-background)', border: '1px solid var(--color-border)', color: 'var(--color-text-main)', outline: 'none' }}>
                  {MOTION_PRESETS.map(m => <option key={m} value={m}>{m.replace(/_/g,' ')}</option>)}
                </select>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <label className="text-xs mb-1 block" style={{ color: 'var(--color-text-muted)' }}>Position</label>
              <select value={selectedItem.position_preset} onChange={e => updateItem(selectedItem.id, 'position_preset', e.target.value)}
                className="w-full text-xs rounded-lg px-2 py-1.5"
                style={{ background: 'var(--color-background)', border: '1px solid var(--color-border)', color: 'var(--color-text-main)', outline: 'none' }}>
                {POSITION_PRESETS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      <button onClick={saveTimeline} disabled={saving}
        className="w-full py-2.5 rounded-xl font-bold text-sm text-white"
        style={{ background: saved ? '#059669' : saving ? '#9ca3af' : 'linear-gradient(135deg,#e11d48,#9333ea)' }}>
        {saved ? '✅ Saved!' : saving ? 'Saving…' : '💾 Save Timeline'}
      </button>
    </div>
  );
}

// ─── AI panel ─────────────────────────────────────────────────────────────────
function AIPanel({ projectId, project, onProjectUpdate, musicTracks, onMusicSelect }) {
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', content: `Hey! I'm here to help with ${project?.movie_title || 'your movie'}. Ask me anything — facts, plot details, or script ideas!` }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaSaved, setMetaSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('metadata');
  const chatEndRef = useRef(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  async function generateMetadata() {
    setMetaLoading(true); setMetaSaved(false);
    try {
      const { data } = await api.post(`/api/v2/movie-review/projects/${projectId}/ai/metadata`);
      onProjectUpdate(data.result);
      setMetaSaved(true); setTimeout(() => setMetaSaved(false), 3000);
    } catch (err) {
      alert('AI error: ' + err.message);
    } finally {
      setMetaLoading(false);
    }
  }

  async function sendChat() {
    if (!chatInput.trim()) return;
    const userMsg = { role: 'user', content: chatInput };
    setChatMessages(m => [...m, userMsg]);
    setChatInput('');
    setChatLoading(true);
    try {
      const history = [...chatMessages, userMsg].filter(m => m.role !== 'system');
      const { data } = await api.post('/api/v2/movie-review/ai/chat', { messages: history, movie_title: project?.movie_title });
      setChatMessages(m => [...m, { role: 'assistant', content: data.message }]);
    } catch (err) {
      setChatMessages(m => [...m, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setChatLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Sub-tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        {[{ key:'metadata', label:'🤖 AI Metadata' }, { key:'chat', label:'💬 Fact Check' }, { key:'music', label:'🎵 Music' }].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{
              background: activeTab === t.key ? 'linear-gradient(135deg,#e11d48,#9333ea)' : 'transparent',
              color: activeTab === t.key ? '#fff' : 'var(--color-text-muted)',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Metadata tab */}
      {activeTab === 'metadata' && (
        <div className="rounded-2xl p-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
            AI will generate a title, description, hook, and hashtags for your YouTube Short based on your movie and notes.
          </p>
          <button onClick={generateMetadata} disabled={metaLoading}
            className="w-full py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 mb-4"
            style={{ background: metaSaved ? '#059669' : metaLoading ? '#9ca3af' : 'linear-gradient(135deg,#e11d48,#9333ea)' }}>
            {metaLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</> : metaSaved ? '✅ Generated & Saved!' : <><Sparkles className="w-4 h-4" /> Generate AI Metadata</>}
          </button>

          {/* Show current values */}
          {project?.hook_text && (
            <div className="space-y-2 text-sm">
              <div className="p-3 rounded-xl" style={{ background: 'var(--color-background)' }}>
                <p className="text-xs font-semibold mb-1" style={{ color: 'var(--color-text-muted)' }}>Hook</p>
                <p style={{ color: 'var(--color-text-main)' }}>{project.hook_text}</p>
              </div>
              {project.tagline_text && (
                <div className="p-3 rounded-xl" style={{ background: 'var(--color-background)' }}>
                  <p className="text-xs font-semibold mb-1" style={{ color: 'var(--color-text-muted)' }}>Tagline</p>
                  <p style={{ color: 'var(--color-text-main)' }}>{project.tagline_text}</p>
                </div>
              )}
              {project.yt_title && (
                <div className="p-3 rounded-xl" style={{ background: 'var(--color-background)' }}>
                  <p className="text-xs font-semibold mb-1" style={{ color: 'var(--color-text-muted)' }}>YouTube Title</p>
                  <p style={{ color: 'var(--color-text-main)' }}>{project.yt_title}</p>
                </div>
              )}
              {project.yt_hashtags?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {project.yt_hashtags.map((tag, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-full text-xs"
                      style={{ background: 'rgba(147,51,234,0.1)', color: '#9333ea' }}>
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Chat tab */}
      {activeTab === 'chat' && (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div className="p-4 space-y-3 overflow-y-auto" style={{ maxHeight: 320 }}>
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className="px-3 py-2 rounded-2xl text-sm max-w-xs"
                  style={{
                    background: msg.role === 'user' ? 'linear-gradient(135deg,#e11d48,#9333ea)' : 'var(--color-background)',
                    color: msg.role === 'user' ? '#fff' : 'var(--color-text-main)',
                  }}>
                  {msg.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="px-3 py-2 rounded-2xl text-sm" style={{ background: 'var(--color-background)', color: 'var(--color-text-muted)' }}>
                  <Loader2 className="w-4 h-4 animate-spin inline" />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="p-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex gap-2">
              <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                placeholder="Ask about facts, plot, characters…"
                className="flex-1 px-3 py-2 rounded-xl text-sm"
                style={{ background: 'var(--color-background)', border: '1px solid var(--color-border)', color: 'var(--color-text-main)', outline: 'none' }} />
              <button onClick={sendChat} disabled={chatLoading || !chatInput.trim()}
                className="px-3 py-2 rounded-xl"
                style={{ background: 'linear-gradient(135deg,#e11d48,#9333ea)', color: '#fff' }}>
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Music tab */}
      {activeTab === 'music' && (
        <div className="rounded-2xl p-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
            Pick background music — it will play quietly behind your voice.
          </p>
          {musicTracks.length === 0 ? (
            <div className="text-center py-6" style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
              No music available yet. Upload tracks in Settings or via Orbix Network.
            </div>
          ) : (
            <div className="space-y-2">
              <button onClick={() => onMusicSelect(null)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-left"
                style={{ background: !project?.music_asset_id ? 'rgba(225,29,72,0.1)' : 'var(--color-background)', border: '1px solid var(--color-border)' }}>
                <span>🚫</span>
                <span style={{ color: 'var(--color-text-main)' }}>No music</span>
              </button>
              {musicTracks.map(track => (
                <button key={track.id} onClick={() => onMusicSelect(track)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-left"
                  style={{ background: 'var(--color-background)', border: '1px solid var(--color-border)' }}>
                  <Music className="w-4 h-4 flex-shrink-0" style={{ color: '#9333ea' }} />
                  <span className="truncate flex-1" style={{ color: 'var(--color-text-main)' }}>{track.name}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: track.source === 'own' ? '#dbeafe' : '#f3f4f6', color: track.source === 'own' ? '#2563eb' : '#6b7280' }}>
                    {track.source === 'own' ? 'Mine' : 'Orbix'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main editor ──────────────────────────────────────────────────────────────
export default function MovieReviewEditor() {
  const { id: projectId } = useParams();
  const router = useRouter();
  const [project, setProject] = useState(null);
  const [images, setImages] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [voiceAsset, setVoiceAsset] = useState(null);
  const [musicTracks, setMusicTracks] = useState([]);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => { loadProject(); loadMusic(); }, [projectId]);

  async function loadProject() {
    try {
      const { data } = await api.get(`/api/v2/movie-review/projects/${projectId}`);
      const p = data.project;
      setProject(p);
      const imgs = (p.assets || []).filter(a => a.type === 'IMAGE');
      const voice = p.voice_asset_id ? (p.assets || []).find(a => a.id === p.voice_asset_id) : null;
      setImages(imgs);
      setVoiceAsset(voice || null);
      // Enrich timeline with asset URLs
      const tl = (p.timeline || []).map(item => {
        if (item.type === 'IMAGE' && item.asset_id) {
          const asset = (p.assets || []).find(a => a.id === item.asset_id);
          return { ...item, asset_url: asset?.public_url };
        }
        return item;
      });
      setTimeline(tl);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadMusic() {
    try {
      const { data } = await api.get('/api/v2/movie-review/music');
      setMusicTracks(data.tracks || []);
    } catch (_) {}
  }

  async function handleMusicSelect(track) {
    try {
      // For now store music info in project notes or a separate mechanism
      // We'll store the music track as an asset and link it
      if (track) {
        // Check if this track is already an asset in this project
        const existing = (project?.assets || []).find(a => a.type === 'AUDIO_MUSIC' && a.storage_path === track.path);
        let musicAssetId = existing?.id;
        localStorage.setItem(`mr-music-${projectId}`, JSON.stringify({ ...track }));
        setProject(p => ({ ...p, _selectedMusic: track }));
      } else {
        localStorage.removeItem(`mr-music-${projectId}`);
        setProject(p => ({ ...p, _selectedMusic: null, music_asset_id: null }));
        await api.put(`/api/v2/movie-review/projects/${projectId}`, { music_asset_id: null });
      }
    } catch (err) {
      console.error('Music select error:', err.message);
    }
  }

  function handleVoiceChange(asset) {
    setVoiceAsset(asset);
    setProject(p => ({ ...p, voice_asset_id: asset?.id || null }));
  }

  function handleProjectUpdate(updates) {
    setProject(p => ({ ...p, ...updates }));
  }

  async function goToRender() {
    if (!voiceAsset) { alert('Record your voice first!'); return; }
    router.push(`/dashboard/v2/modules/movie-review/projects/${projectId}/render`);
  }

  if (loading) {
    return (
      <AuthGuard><V2AppShell>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#9333ea' }} />
        </div>
      </V2AppShell></AuthGuard>
    );
  }

  if (error) {
    return (
      <AuthGuard><V2AppShell>
        <div className="p-6 text-center" style={{ color: '#dc2626' }}>{error}</div>
      </V2AppShell></AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <V2AppShell>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '16px' }}>
          {/* Header */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <button onClick={() => router.push('/dashboard/v2/modules/movie-review/dashboard')}
              className="flex items-center gap-1 text-sm flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="font-bold text-base truncate" style={{ color: 'var(--color-text-main)' }}>
                🎬 {project?.movie_title}
              </h1>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {project?.content_type === 'review' ? '🎬 Review' : project?.content_type === 'facts' ? '🤓 Facts' : project?.content_type}
              </p>
            </div>
            <button
              onClick={goToRender}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-white text-sm flex-shrink-0"
              style={{ background: voiceAsset ? 'linear-gradient(135deg,#e11d48,#9333ea)' : '#9ca3af' }}
            >
              🎬 Render
            </button>
          </div>

          {/* Step bar */}
          <StepBar step={step} steps={STEPS} onStep={setStep} />

          {/* Step content */}
          {step === 0 && (
            <VoicePanel
              projectId={projectId}
              voiceAsset={voiceAsset}
              onVoiceChange={handleVoiceChange}
            />
          )}
          {step === 1 && (
            <ImagesPanel
              projectId={projectId}
              images={images}
              onImagesChange={setImages}
            />
          )}
          {step === 2 && (
            <TimelinePanel
              projectId={projectId}
              images={images}
              voiceAsset={voiceAsset}
              timelineItems={timeline}
              onTimelineChange={tl => setTimeline(tl)}
              maxDuration={project?.max_duration_seconds || null}
              onMaxDurationChange={d => setProject(p => ({ ...p, max_duration_seconds: d }))}
            />
          )}
          {step === 3 && (
            <AIPanel
              projectId={projectId}
              project={project}
              onProjectUpdate={handleProjectUpdate}
              musicTracks={musicTracks}
              onMusicSelect={handleMusicSelect}
            />
          )}

          {/* Nav arrows */}
          <div className="flex justify-between mt-4">
            <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}
              className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm"
              style={{ color: step === 0 ? 'var(--color-text-muted)' : 'var(--color-text-main)', background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            {step < STEPS.length - 1 ? (
              <button onClick={() => setStep(s => Math.min(STEPS.length - 1, s + 1))}
                className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-semibold text-white"
                style={{ background: 'linear-gradient(135deg,#e11d48,#9333ea)' }}>
                Next <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={goToRender}
                className="flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-bold text-white"
                style={{ background: voiceAsset ? 'linear-gradient(135deg,#e11d48,#9333ea)' : '#9ca3af' }}>
                🎬 Go to Render
              </button>
            )}
          </div>
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}
