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

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001').replace(/\/$/, '');

function getAuthHeaders() {
  if (typeof document === 'undefined') return {};
  const token = document.cookie.split(';').find(c => c.trim().startsWith('token='))?.split('=')[1];
  return { Authorization: `Bearer ${token}` };
}
function getBusinessId() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('activeBusinessId') || localStorage.getItem('businessId');
}
function apiHeaders(json = false) {
  const h = { ...getAuthHeaders(), 'X-Active-Business-Id': getBusinessId() };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

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
// ── WAV encoder helpers ───────────────────────────────────────────────────────
// Encodes raw Float32 PCM samples into a standard WAV file blob.
// No external libraries, no MediaRecorder, no FFmpeg needed for playback.
function encodeWav(samples, sampleRate) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataLength = samples.length * 2; // 16-bit = 2 bytes per sample
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  function writeString(offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }
  function writeInt16(offset, val) {
    view.setInt16(offset, Math.max(-32768, Math.min(32767, val * 32767)), true);
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);           // PCM chunk size
  view.setUint16(20, 1, true);            // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  for (let i = 0; i < samples.length; i++) writeInt16(44 + i * 2, samples[i]);

  return new Blob([buffer], { type: 'audio/wav' });
}

function VoicePanel({ projectId, voiceAsset, onVoiceChange }) {
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [audioError, setAudioError] = useState(null);
  const [localUrl, setLocalUrl] = useState(null); // instant local preview URL
  const audioCtxRef = useRef(null);
  const processorRef = useRef(null);
  const streamRef = useRef(null);
  const samplesRef = useRef([]);
  const sampleRateRef = useRef(44100);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);

  // Clean up local object URL on unmount
  useEffect(() => {
    return () => { if (localUrl) URL.revokeObjectURL(localUrl); };
  }, [localUrl]);

  async function startRecording() {
    setError(null);
    setAudioError(null);
    setLocalUrl(null);
    samplesRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;

      const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
      audioCtxRef.current = ctx;
      sampleRateRef.current = ctx.sampleRate;

      const source = ctx.createMediaStreamSource(stream);

      // ScriptProcessor collects raw PCM — works in every browser
      const bufferSize = 4096;
      const processor = ctx.createScriptProcessor(bufferSize, 1, 1);
      processor.onaudioprocess = e => {
        // Copy the Float32 samples into our accumulator
        const input = e.inputBuffer.getChannelData(0);
        samplesRef.current.push(new Float32Array(input));
      };

      source.connect(processor);
      processor.connect(ctx.destination);
      processorRef.current = processor;

      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } catch (err) {
      setError('Microphone error: ' + err.message);
    }
  }

  async function stopRecording() {
    clearInterval(timerRef.current);
    setRecording(false);

    // Disconnect processor and stop mic stream
    processorRef.current?.disconnect();
    audioCtxRef.current?.close();
    streamRef.current?.getTracks().forEach(t => t.stop());

    // Merge all collected Float32 chunks into one array
    const chunks = samplesRef.current;
    if (!chunks.length) {
      setError('No audio captured — please check your microphone and try again.');
      return;
    }
    const totalLen = chunks.reduce((n, c) => n + c.length, 0);
    const merged = new Float32Array(totalLen);
    let offset = 0;
    for (const c of chunks) { merged.set(c, offset); offset += c.length; }

    // Build WAV blob immediately
    const wav = encodeWav(merged, sampleRateRef.current);

    // Show instant local preview so user can hear it right now
    const previewUrl = URL.createObjectURL(wav);
    setLocalUrl(previewUrl);

    // Upload in the background
    await uploadRecording(wav);
  }

  async function uploadRecording(wavBlob) {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('voice', wavBlob, 'voice.wav');
      const res = await fetch(`${API_URL}/api/v2/movie-review/projects/${projectId}/voice`, {
        method: 'POST',
        headers: apiHeaders(false),
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      onVoiceChange(data.asset);
    } catch (err) {
      setError('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  }

  async function deleteVoice() {
    if (!confirm('Delete voice recording?')) return;
    setAudioError(null);
    setLocalUrl(null);
    await fetch(`${API_URL}/api/v2/movie-review/projects/${projectId}/voice`, {
      method: 'DELETE', headers: apiHeaders(),
    });
    onVoiceChange(null);
  }

  const fmtTime = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const hasVoice = !!voiceAsset?.public_url;
  // Use local preview URL first (instant), fall back to saved Supabase URL
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
              <div className="text-center py-6">
                <div className="inline-flex items-center gap-3 mb-4">
                  <div className="w-4 h-4 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-2xl font-bold" style={{ color: '#dc2626' }}>{fmtTime(elapsed)}</span>
                </div>
                <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>Recording in progress…</p>
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
      const res = await fetch(`${API_URL}/api/v2/movie-review/projects/${projectId}/images`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'X-Active-Business-Id': getBusinessId() },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
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
    await fetch(`${API_URL}/api/v2/movie-review/assets/${asset.id}`, {
      method: 'DELETE', headers: apiHeaders(),
    });
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
    await fetch(`${API_URL}/api/v2/movie-review/projects/${projectId}/images/reorder`, {
      method: 'PUT', headers: apiHeaders(true),
      body: JSON.stringify({ order: newOrder.map(i => i.id) }),
    });
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

// ─── Timeline panel ───────────────────────────────────────────────────────────
function TimelinePanel({ projectId, images, voiceAsset, timelineItems, onTimelineChange, maxDuration }) {
  const [items, setItems] = useState(timelineItems || []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const dur = voiceAsset?.duration_seconds || maxDuration || 50;

  useEffect(() => { setItems(timelineItems || []); }, [timelineItems]);

  function addImageItem(asset) {
    const last = items[items.length - 1];
    const start = last ? last.end_time : 0;
    const end = Math.min(start + 5, dur);
    setItems(prev => [...prev, {
      id: `tmp-${Date.now()}`,
      type: 'IMAGE',
      asset_id: asset.id,
      asset_url: asset.public_url,
      start_time: start,
      end_time: end,
      motion_preset: 'ZOOM_IN',
      position_preset: 'CENTER',
      order_index: prev.length,
    }]);
  }

  function addTextItem() {
    const last = items[items.length - 1];
    const start = last ? last.end_time : 0;
    const end = Math.min(start + 3, dur);
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

  function updateItem(idx, field, value) {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  function removeItem(idx) {
    setItems(prev => prev.filter((_, i) => i !== idx));
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
      const res = await fetch(`${API_URL}/api/v2/movie-review/projects/${projectId}/timeline`, {
        method: 'PUT', headers: apiHeaders(true), body: JSON.stringify({ items: payload }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      onTimelineChange(items);
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  // Auto-distribute all images evenly
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

  function handleDragEnd(targetIdx) {
    if (dragIdx === null || dragIdx === targetIdx) { setDragIdx(null); setDragOverIdx(null); return; }
    const newItems = [...items];
    const [moved] = newItems.splice(dragIdx, 1);
    newItems.splice(targetIdx, 0, moved);
    setItems(newItems.map((it, i) => ({ ...it, order_index: i })));
    setDragIdx(null); setDragOverIdx(null);
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl p-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-base" style={{ color: 'var(--color-text-main)' }}>📽️ Timeline</h2>
          <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Duration: {dur.toFixed(1)}s</div>
        </div>

        {/* Controls row */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button onClick={autoDistribute} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: 'var(--color-background)', border: '1px solid var(--color-border)', color: 'var(--color-text-main)' }}>
            <Wand2 className="w-3 h-3" /> Auto-distribute
          </button>
          <button onClick={addTextItem} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: 'var(--color-background)', border: '1px solid var(--color-border)', color: 'var(--color-text-main)' }}>
            <Type className="w-3 h-3" /> Add Text
          </button>
        </div>

        {/* Add images from library */}
        {images.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-muted)' }}>Tap an image to add to timeline:</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {images.map(img => (
                <button key={img.id} onClick={() => addImageItem(img)}
                  className="flex-shrink-0 rounded-lg overflow-hidden border-2"
                  style={{ width: 48, height: 72, border: '2px solid var(--color-border)' }}>
                  <img src={img.public_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Visual timeline bar */}
        {items.length > 0 && dur > 0 && (
          <div className="mb-4 relative rounded-lg overflow-hidden" style={{ height: 28, background: 'var(--color-background)' }}>
            {items.filter(i => i.type === 'IMAGE').map((item, idx) => {
              const left = (item.start_time / dur) * 100;
              const width = ((item.end_time - item.start_time) / dur) * 100;
              return (
                <div key={item.id} className="absolute top-0 h-full rounded flex items-center justify-center text-xs text-white font-bold"
                  style={{
                    left: `${left}%`, width: `${width}%`,
                    background: `hsl(${(idx * 67) % 360},70%,50%)`,
                    fontSize: 9, overflow: 'hidden', paddingInline: 2,
                  }}>
                  {idx + 1}
                </div>
              );
            })}
          </div>
        )}

        {/* Items list */}
        {items.length === 0 ? (
          <div className="text-center py-6" style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
            No items yet — add images or text above, or use Auto-distribute
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={item.id}
                draggable
                onDragStart={() => setDragIdx(idx)}
                onDragOver={e => { e.preventDefault(); setDragOverIdx(idx); }}
                onDrop={() => handleDragEnd(idx)}
                onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                className="rounded-xl p-3 transition-all"
                style={{
                  background: 'var(--color-background)',
                  border: `1px solid ${dragOverIdx === idx ? '#e11d48' : 'var(--color-border)'}`,
                  opacity: dragIdx === idx ? 0.5 : 1,
                  cursor: 'grab',
                }}
              >
                <div className="flex items-start gap-2">
                  <GripVertical className="w-4 h-4 mt-1 flex-shrink-0" style={{ color: 'var(--color-text-muted)' }} />

                  {item.type === 'IMAGE' && item.asset_url && (
                    <img src={item.asset_url} alt="" className="flex-shrink-0 rounded"
                      style={{ width: 32, height: 48, objectFit: 'cover' }} />
                  )}
                  {item.type === 'TEXT' && (
                    <div className="flex-shrink-0 flex items-center justify-center rounded"
                      style={{ width: 32, height: 48, background: '#1e1b2e', color: '#c084fc', fontSize: 18 }}>
                      T
                    </div>
                  )}

                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: item.type === 'IMAGE' ? 'rgba(147,51,234,0.15)' : 'rgba(225,29,72,0.15)', color: item.type === 'IMAGE' ? '#9333ea' : '#e11d48' }}>
                        {item.type === 'IMAGE' ? '🖼️ Image' : '📝 Text'}
                      </span>
                    </div>

                    {item.type === 'TEXT' && (
                      <input value={item.text_content || ''} onChange={e => updateItem(idx, 'text_content', e.target.value)}
                        className="w-full px-2 py-1 rounded text-xs"
                        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-main)', outline: 'none' }} />
                    )}

                    {/* Time range */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Start</label>
                      <input type="number" min={0} max={dur} step={0.1}
                        value={item.start_time}
                        onChange={e => updateItem(idx, 'start_time', parseFloat(e.target.value) || 0)}
                        className="w-16 px-1.5 py-0.5 rounded text-xs text-center"
                        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-main)', outline: 'none' }} />
                      <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>End</label>
                      <input type="number" min={0} max={dur} step={0.1}
                        value={item.end_time}
                        onChange={e => updateItem(idx, 'end_time', parseFloat(e.target.value) || 0)}
                        className="w-16 px-1.5 py-0.5 rounded text-xs text-center"
                        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-main)', outline: 'none' }} />
                    </div>

                    {/* Presets row */}
                    <div className="flex gap-2 flex-wrap">
                      {item.type === 'IMAGE' && (
                        <select value={item.motion_preset} onChange={e => updateItem(idx, 'motion_preset', e.target.value)}
                          className="text-xs rounded px-1.5 py-0.5"
                          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-main)', outline: 'none' }}>
                          {MOTION_PRESETS.map(m => <option key={m} value={m}>{m.replace('_',' ')}</option>)}
                        </select>
                      )}
                      <select value={item.position_preset} onChange={e => updateItem(idx, 'position_preset', e.target.value)}
                        className="text-xs rounded px-1.5 py-0.5"
                        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-main)', outline: 'none' }}>
                        {POSITION_PRESETS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  </div>

                  <button onClick={() => removeItem(idx)} className="p-1 flex-shrink-0" style={{ color: '#dc2626' }}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <button onClick={saveTimeline} disabled={saving}
          className="w-full mt-4 py-2.5 rounded-xl font-bold text-sm text-white"
          style={{ background: saved ? '#059669' : saving ? '#9ca3af' : 'linear-gradient(135deg,#e11d48,#9333ea)' }}>
          {saved ? '✅ Saved!' : saving ? 'Saving…' : '💾 Save Timeline'}
        </button>
      </div>
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
      const res = await fetch(`${API_URL}/api/v2/movie-review/projects/${projectId}/ai/metadata`, {
        method: 'POST', headers: apiHeaders(true),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
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
      const res = await fetch(`${API_URL}/api/v2/movie-review/ai/chat`, {
        method: 'POST', headers: apiHeaders(true),
        body: JSON.stringify({ messages: history, movie_title: project?.movie_title }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
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
      const res = await fetch(`${API_URL}/api/v2/movie-review/projects/${projectId}`, { headers: apiHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
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
      const res = await fetch(`${API_URL}/api/v2/movie-review/music`, { headers: apiHeaders() });
      const data = await res.json();
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
        if (!musicAssetId) {
          // Create a music asset record linking to the selected track
          const res = await fetch(`${API_URL}/api/v2/movie-review/projects/${projectId}`, {
            method: 'PUT', headers: apiHeaders(true),
            body: JSON.stringify({ music_asset_id: null }), // will update below
          });
        }
        // Update project with music selection stored as a note in music_asset_id
        // For simplicity, store the track URL directly in project update via a temp asset
        await fetch(`${API_URL}/api/v2/movie-review/projects/${projectId}`, {
          method: 'PUT', headers: apiHeaders(true),
          body: JSON.stringify({ notes_text: project?.notes_text }),
        });
        // Store music selection in localStorage for now (renderer will pick it up via music_asset_id lookup)
        localStorage.setItem(`mr-music-${projectId}`, JSON.stringify({ ...track }));
        setProject(p => ({ ...p, _selectedMusic: track }));
      } else {
        localStorage.removeItem(`mr-music-${projectId}`);
        setProject(p => ({ ...p, _selectedMusic: null, music_asset_id: null }));
        await fetch(`${API_URL}/api/v2/movie-review/projects/${projectId}`, {
          method: 'PUT', headers: apiHeaders(true),
          body: JSON.stringify({ music_asset_id: null }),
        });
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
              maxDuration={project?.max_duration_seconds || 50}
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
