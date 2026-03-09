'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import { ChevronLeft, Loader2, CheckCircle, XCircle, Upload, ExternalLink, Sparkles } from 'lucide-react';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001').replace(/\/$/, '');

function getAuthHeaders() {
  if (typeof document === 'undefined') return {};
  const token = document.cookie.split(';').find(c => c.trim().startsWith('token='))?.split('=')[1];
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}
function getBusinessId() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('activeBusinessId') || localStorage.getItem('businessId');
}
function apiHeaders() {
  return { ...getAuthHeaders(), 'X-Active-Business-Id': getBusinessId() };
}

const STEPS = [
  { href: (id) => `/dashboard/v2/modules/movie-review/projects/${id}/editor`, label: 'Editor' },
  { href: (id) => `/dashboard/v2/modules/movie-review/projects/${id}/render`, label: 'Render' },
  { href: (id) => `/dashboard/v2/modules/movie-review/projects/${id}/upload`, label: 'Upload' },
];

function StepBar({ currentStep, projectId }) {
  return (
    <div className="flex items-center mb-4" style={{ gap: 2, minWidth: 0 }}>
      {STEPS.map((s, i) => {
        const active = i === currentStep;
        const done = i < currentStep;
        return (
          <div key={s.label} className="flex items-center" style={{ flex: '1 1 0', minWidth: 0 }}>
            <Link href={s.href(projectId)}
              className="flex items-center justify-center gap-1 w-full rounded-lg py-1.5 text-xs font-semibold truncate"
              style={{
                background: active ? 'linear-gradient(135deg,#e11d48,#9333ea)' : done ? 'rgba(225,29,72,0.12)' : 'var(--color-surface)',
                color: active ? '#fff' : done ? '#e11d48' : 'var(--color-text-muted)',
                border: `1px solid ${active ? 'transparent' : done ? '#fda4af' : 'var(--color-border)'}`,
              }}>
              {done && <CheckCircle className="w-3 h-3 flex-shrink-0" />}
              <span className="truncate">{s.label}</span>
            </Link>
            {i < STEPS.length - 1 && (
              <div className="flex-shrink-0" style={{ width: 6, height: 1, background: 'var(--color-border)' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

const PRIVACY_OPTIONS = [
  { value: 'PUBLIC',   label: '🌍 Public',    desc: 'Anyone can see it' },
  { value: 'UNLISTED', label: '🔗 Unlisted',  desc: 'Only people with the link' },
  { value: 'PRIVATE',  label: '🔒 Private',   desc: 'Only you' },
];

export default function MovieReviewUploadPage() {
  const { id: projectId } = useParams();
  const router = useRouter();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [ytConnected, setYtConnected] = useState(null);
  const [savingMeta, setSavingMeta] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [polishMsg, setPolishMsg] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0); // 0–95 while uploading
  const [uploadStep, setUploadStep] = useState(0);         // 0=Preparing, 1=Uploading, 2=Processing
  const [cancellingUpload, setCancellingUpload] = useState(false);
  const pollRef = useRef(null);
  const progressRef = useRef(null);
  const uploadStartedAtRef = useRef(null);

  useEffect(() => {
    loadProject();
    loadYtStatus();
    return () => {
      clearInterval(pollRef.current);
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, [projectId]);

  async function loadProject() {
    try {
      const res = await fetch(`${API_URL}/api/v2/movie-review/projects/${projectId}`, { headers: apiHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setProject(data.project);
      if (data.project.status === 'UPLOADING') {
        // If we just landed on the page, assume it might be stuck — show "Cancel" after a short delay
        uploadStartedAtRef.current = Date.now() - 180000; // 3 min ago so option shows soon
        startPolling();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadYtStatus() {
    try {
      const res = await fetch(`${API_URL}/api/v2/movie-review/youtube/status`, { headers: apiHeaders() });
      const data = await res.json();
      setYtConnected(data.connected);
    } catch (_) {}
  }

  const UPLOAD_STEPS = ['Preparing…', 'Uploading to YouTube…', 'Processing…'];

  function startProgressAnimation() {
    setUploadProgress(0);
    setUploadStep(0);
    if (progressRef.current) clearInterval(progressRef.current);
    let step = 0;
    let percent = 0;
    progressRef.current = setInterval(() => {
      step = Math.min(2, step + 1);
      percent = Math.min(95, percent + 25);
      setUploadStep(step);
      setUploadProgress(percent);
      if (percent >= 95 && progressRef.current) {
        clearInterval(progressRef.current);
        progressRef.current = null;
      }
    }, 12000);
  }

  function stopProgressAnimation() {
    if (progressRef.current) {
      clearInterval(progressRef.current);
      progressRef.current = null;
    }
  }

  async function cancelUpload() {
    setCancellingUpload(true);
    try {
      const res = await fetch(`${API_URL}/api/v2/movie-review/projects/${projectId}/cancel-upload`, {
        method: 'POST',
        headers: apiHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Cancel failed');
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      stopProgressAnimation();
      setUploading(false);
      setProject(data.project);
    } catch (err) {
      setError(err.message);
    } finally {
      setCancellingUpload(false);
    }
  }

  function startPolling() {
    clearInterval(pollRef.current);
    startProgressAnimation();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/api/v2/movie-review/projects/${projectId}`, { headers: apiHeaders() });
        const data = await res.json();
        const proj = data.project;
        setProject(proj);
        if (proj.status !== 'UPLOADING') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          stopProgressAnimation();
          if (proj.status === 'PUBLISHED') setUploadProgress(100);
          if (proj.status === 'FAILED') setUploading(false);
        }
      } catch (_) {}
    }, 3000);
  }

  async function saveMeta() {
    setSavingMeta(true);
    try {
      await fetch(`${API_URL}/api/v2/movie-review/projects/${projectId}`, {
        method: 'PUT', headers: apiHeaders(),
        body: JSON.stringify({
          yt_title: project.yt_title,
          yt_description: project.yt_description,
          yt_hashtags: project.yt_hashtags,
          privacy: project.privacy,
        }),
      });
    } catch (_) {}
    setSavingMeta(false);
  }

  async function polishText() {
    setPolishing(true);
    setPolishMsg(null);
    try {
      const res = await fetch(`${API_URL}/api/v2/movie-review/projects/${projectId}/ai/polish`, {
        method: 'POST', headers: apiHeaders(),
        body: JSON.stringify({
          yt_title: project.yt_title,
          yt_description: project.yt_description,
          yt_hashtags: project.yt_hashtags,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Polish failed');
      setProject(p => ({
        ...p,
        yt_title: data.yt_title ?? p.yt_title,
        yt_description: data.yt_description ?? p.yt_description,
        yt_hashtags: data.yt_hashtags ?? p.yt_hashtags,
      }));
      setPolishMsg('✅ Text polished!');
      setTimeout(() => setPolishMsg(null), 3000);
    } catch (err) {
      setPolishMsg('❌ ' + err.message);
    } finally {
      setPolishing(false);
    }
  }

  async function uploadToYouTube() {
    if (!ytConnected) {
      router.push('/dashboard/v2/modules/movie-review/settings');
      return;
    }
    await saveMeta();
    setUploading(true); setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v2/movie-review/projects/${projectId}/upload`, {
        method: 'POST', headers: apiHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setProject(p => ({ ...p, status: 'UPLOADING' }));
      uploadStartedAtRef.current = Date.now();
      startPolling();
    } catch (err) {
      setError(err.message);
      setUploading(false);
    }
  }

  const isPublished = project?.status === 'PUBLISHED';
  const isUploading = project?.status === 'UPLOADING';
  const isFailed = project?.status === 'FAILED';
  const youtubeUrl = project?.youtube_video_id
    ? `https://www.youtube.com/shorts/${project.youtube_video_id}`
    : null;
  const uploadErrorMessage = project?.upload_error || 'Upload failed. Please try again.';

  if (loading) {
    return <AuthGuard><V2AppShell><div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin" style={{ color: '#9333ea' }} /></div></V2AppShell></AuthGuard>;
  }

  return (
    <AuthGuard>
      <V2AppShell>
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '16px' }}>
          <button onClick={() => router.push(`/dashboard/v2/modules/movie-review/projects/${projectId}/render`)}
            className="flex items-center gap-1 text-sm mb-3" style={{ color: 'var(--color-text-muted)' }}>
            <ChevronLeft className="w-4 h-4" /> Back to Render
          </button>

          <StepBar currentStep={2} projectId={projectId} />

          <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--color-text-main)' }}>📺 Upload to YouTube</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>Review your metadata and publish your Short.</p>

          {error && <div className="p-3 mb-4 rounded-lg text-sm" style={{ background: '#fee2e2', color: '#dc2626' }}>{error}</div>}

          {/* YouTube connection status */}
          {ytConnected === false && (
            <div className="p-4 mb-4 rounded-2xl" style={{ background: '#fee2e2', border: '1px solid #fecaca' }}>
              <p className="text-sm font-bold mb-1" style={{ color: '#dc2626' }}>YouTube not connected</p>
              <p className="text-xs mb-3" style={{ color: '#dc2626' }}>Connect your YouTube channel in Settings first.</p>
              <Link href="/dashboard/v2/modules/movie-review/settings"
                className="inline-block px-4 py-2 rounded-lg text-sm font-bold text-white"
                style={{ background: '#dc2626' }}>
                Go to Settings
              </Link>
            </div>
          )}

          {isPublished ? (
            <div className="rounded-2xl p-6 text-center" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <CheckCircle className="w-14 h-14 mx-auto mb-3" style={{ color: '#059669' }} />
              <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text-main)' }}>Published! 🎉</h2>
              <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>Your Short is live on YouTube!</p>
              {youtubeUrl && (
                <a href={youtubeUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-white"
                  style={{ background: '#dc2626' }}>
                  <ExternalLink className="w-4 h-4" /> View on YouTube
                </a>
              )}
            </div>
          ) : isUploading ? (
            <div className="rounded-2xl p-6 text-center" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <Loader2 className="w-12 h-12 mx-auto mb-3 animate-spin" style={{ color: '#9333ea' }} />
              <h2 className="text-lg font-bold" style={{ color: 'var(--color-text-main)' }}>{UPLOAD_STEPS[uploadStep]}</h2>
              <p className="text-sm mt-2 mb-4" style={{ color: 'var(--color-text-muted)' }}>{uploadProgress}%</p>
              <div className="w-full rounded-full h-2 overflow-hidden" style={{ background: 'var(--color-border)' }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${uploadProgress}%`, background: 'linear-gradient(135deg,#e11d48,#9333ea)' }}
                />
              </div>
              {uploadStartedAtRef.current && (Date.now() - uploadStartedAtRef.current) > 150000 && (
                <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--color-border)' }}>
                  <p className="text-sm mb-2" style={{ color: 'var(--color-text-muted)' }}>Taking a while? You can cancel and try again.</p>
                  <button
                    onClick={cancelUpload}
                    disabled={cancellingUpload}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
                    style={{
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text-main)',
                      cursor: cancellingUpload ? 'wait' : 'pointer',
                    }}
                  >
                    {cancellingUpload ? <><Loader2 className="w-4 h-4 animate-spin" /> Cancelling…</> : 'Cancel and try again'}
                  </button>
                </div>
              )}
            </div>
          ) : isFailed ? (
            <div className="rounded-2xl p-6 text-center" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <XCircle className="w-14 h-14 mx-auto mb-3" style={{ color: '#dc2626' }} />
              <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--color-text-main)' }}>Upload failed</h2>
              <p className="text-sm mb-4 px-2" style={{ color: 'var(--color-text-muted)' }}>{uploadErrorMessage}</p>
              <button onClick={uploadToYouTube}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-white"
                style={{ background: 'linear-gradient(135deg,#e11d48,#9333ea)' }}>
                <Upload className="w-4 h-4" /> Try again
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Metadata form */}
              <div className="rounded-2xl p-5" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold text-base" style={{ color: 'var(--color-text-main)' }}>📝 YouTube Metadata</h2>
                  <button
                    onClick={polishText}
                    disabled={polishing}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                    style={{
                      background: polishing ? '#9ca3af' : 'linear-gradient(135deg,#6366f1,#9333ea)',
                      color: '#fff',
                      cursor: polishing ? 'wait' : 'pointer',
                    }}
                  >
                    {polishing
                      ? <><Loader2 className="w-3 h-3 animate-spin" /> Polishing…</>
                      : <><Sparkles className="w-3 h-3" /> Auto-Fix Text</>}
                  </button>
                </div>
                {polishMsg && (
                  <div className="text-xs mb-3 px-3 py-2 rounded-lg"
                    style={{ background: polishMsg.startsWith('✅') ? 'rgba(5,150,105,0.1)' : '#fee2e2', color: polishMsg.startsWith('✅') ? '#059669' : '#dc2626' }}>
                    {polishMsg}
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-text-muted)' }}>Title</label>
                    <input value={project?.yt_title || ''} onChange={e => setProject(p => ({ ...p, yt_title: e.target.value }))}
                      maxLength={100}
                      placeholder="Your video title"
                      className="w-full px-3 py-2 rounded-xl text-sm"
                      style={{ background: 'var(--color-background)', border: '1px solid var(--color-border)', color: 'var(--color-text-main)', outline: 'none' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-text-muted)' }}>Description</label>
                    <textarea rows={4} value={project?.yt_description || ''} onChange={e => setProject(p => ({ ...p, yt_description: e.target.value }))}
                      placeholder="Description"
                      className="w-full px-3 py-2 rounded-xl text-sm resize-none"
                      style={{ background: 'var(--color-background)', border: '1px solid var(--color-border)', color: 'var(--color-text-main)', outline: 'none' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-text-muted)' }}>Hashtags (comma separated)</label>
                    <input
                      value={(project?.yt_hashtags || []).join(', ')}
                      onChange={e => setProject(p => ({ ...p, yt_hashtags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) }))}
                      placeholder="MovieReview, Film, Shorts"
                      className="w-full px-3 py-2 rounded-xl text-sm"
                      style={{ background: 'var(--color-background)', border: '1px solid var(--color-border)', color: 'var(--color-text-main)', outline: 'none' }} />
                  </div>
                </div>
              </div>

              {/* Privacy */}
              <div className="rounded-2xl p-5" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                <h2 className="font-bold text-base mb-3" style={{ color: 'var(--color-text-main)' }}>🔒 Privacy</h2>
                <div className="grid grid-cols-3 gap-2">
                  {PRIVACY_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => setProject(p => ({ ...p, privacy: opt.value }))}
                      className="p-2.5 rounded-xl text-center transition-all"
                      style={{
                        border: `2px solid ${project?.privacy === opt.value ? '#e11d48' : 'var(--color-border)'}`,
                        background: project?.privacy === opt.value ? 'rgba(225,29,72,0.08)' : 'var(--color-background)',
                      }}>
                      <div className="font-bold text-xs" style={{ color: 'var(--color-text-main)' }}>{opt.label}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={uploadToYouTube} disabled={uploading || !project?.render_url}
                className="w-full py-4 rounded-2xl font-bold text-white text-base flex items-center justify-center gap-2"
                style={{ background: uploading || !project?.render_url ? '#9ca3af' : 'linear-gradient(135deg,#e11d48,#9333ea)' }}>
                {uploading ? <><Loader2 className="w-5 h-5 animate-spin" /> Uploading…</> : <><Upload className="w-5 h-5" /> Upload to YouTube</>}
              </button>

              {!project?.render_url && (
                <p className="text-xs text-center" style={{ color: '#f59e0b' }}>
                  ⚠️ You need to render the video first.{' '}
                  <Link href={`/dashboard/v2/modules/movie-review/projects/${projectId}/render`} className="underline">Go to Render</Link>
                </p>
              )}
            </div>
          )}
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}
