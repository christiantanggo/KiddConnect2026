'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import { ChevronLeft, Loader2, CheckCircle, XCircle, Play, Upload } from 'lucide-react';

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

export default function MovieReviewRenderPage() {
  const { id: projectId } = useParams();
  const router = useRouter();
  const [project, setProject] = useState(null);
  const [render, setRender] = useState(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef(null);

  useEffect(() => { loadStatus(); return () => clearInterval(pollRef.current); }, [projectId]);

  async function loadStatus() {
    try {
      const res = await fetch(`${API_URL}/api/v2/movie-review/projects/${projectId}/render-status`, { headers: apiHeaders() });
      const data = await res.json();
      setProject(data.project_status ? { ...data, id: projectId, status: data.project_status } : null);
      setRender(data.render);
      if (data.render?.status === 'RENDERING') {
        startPolling();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function startPolling() {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/api/v2/movie-review/projects/${projectId}/render-status`, { headers: apiHeaders() });
        const data = await res.json();
        setRender(data.render);
        if (data.project_status) setProject(p => ({ ...p, status: data.project_status }));
        if (data.render?.status === 'DONE' || data.render?.status === 'FAILED') {
          clearInterval(pollRef.current);
          setRendering(false);
        }
      } catch (_) {}
    }, 3000);
  }

  async function startRender() {
    setRendering(true); setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v2/movie-review/projects/${projectId}/render`, {
        method: 'POST', headers: apiHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRender({ status: 'RENDERING', progress: 0 });
      startPolling();
    } catch (err) {
      setError(err.message);
      setRendering(false);
    }
  }

  const isDone = render?.status === 'DONE';
  const isFailed = render?.status === 'FAILED';
  const isRendering = render?.status === 'RENDERING' || render?.status === 'PENDING';
  const progress = render?.progress || 0;

  return (
    <AuthGuard>
      <V2AppShell>
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '16px' }}>
          <button onClick={() => router.push(`/dashboard/v2/modules/movie-review/projects/${projectId}/editor`)}
            className="flex items-center gap-1 text-sm mb-3" style={{ color: 'var(--color-text-muted)' }}>
            <ChevronLeft className="w-4 h-4" /> Back to Editor
          </button>

          <StepBar currentStep={1} projectId={projectId} />

          <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--color-text-main)' }}>🎬 Render Your Short</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
            FFmpeg will combine your voice, images, and music into a vertical Short video.
          </p>

          {error && <div className="p-3 mb-4 rounded-lg text-sm" style={{ background: '#fee2e2', color: '#dc2626' }}>{error}</div>}

          {/* Render card */}
          <div className="rounded-2xl p-6 text-center" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            {loading ? (
              <Loader2 className="w-8 h-8 mx-auto animate-spin" style={{ color: '#9333ea' }} />
            ) : isDone ? (
              <>
                <CheckCircle className="w-14 h-14 mx-auto mb-3" style={{ color: '#059669' }} />
                <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--color-text-main)' }}>Render Complete! 🎉</h2>
                <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>Your Short is ready to preview and upload.</p>

                {render.output_url && (
                  <div className="mb-4">
                    <video controls className="w-full rounded-xl" style={{ maxHeight: 400, objectFit: 'contain' }}>
                      <source src={render.output_url} type="video/mp4" />
                    </video>
                  </div>
                )}

                <div className="flex gap-3 flex-wrap justify-center">
                  <button onClick={startRender}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold"
                    style={{ border: '2px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                    🔄 Re-render
                  </button>
                  <Link href={`/dashboard/v2/modules/movie-review/projects/${projectId}/upload`}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-white"
                    style={{ background: 'linear-gradient(135deg,#e11d48,#9333ea)' }}>
                    <Upload className="w-4 h-4" /> Upload to YouTube
                  </Link>
                </div>
              </>
            ) : isFailed ? (
              <>
                <XCircle className="w-14 h-14 mx-auto mb-3" style={{ color: '#dc2626' }} />
                <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--color-text-main)' }}>Render Failed</h2>
                <p className="text-sm mb-4" style={{ color: '#dc2626' }}>{render.error_message || 'Unknown error'}</p>
                <button onClick={startRender}
                  className="px-6 py-3 rounded-xl font-bold text-white"
                  style={{ background: 'linear-gradient(135deg,#e11d48,#9333ea)' }}>
                  🔄 Try Again
                </button>
              </>
            ) : isRendering ? (
              <>
                <Loader2 className="w-14 h-14 mx-auto mb-4 animate-spin" style={{ color: '#9333ea' }} />
                <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--color-text-main)' }}>Rendering…</h2>
                <div className="w-full rounded-full mb-2 overflow-hidden" style={{ height: 10, background: 'var(--color-background)' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: 'linear-gradient(90deg,#e11d48,#9333ea)' }} />
                </div>
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{progress}% complete — this takes about 30–60 seconds</p>
              </>
            ) : (
              <>
                <div className="text-5xl mb-4">🎬</div>
                <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--color-text-main)' }}>Ready to Render</h2>
                <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
                  Make sure your voice is recorded and images are added before rendering.
                </p>
                <button onClick={startRender} disabled={rendering}
                  className="px-8 py-4 rounded-2xl font-bold text-white text-base"
                  style={{ background: 'linear-gradient(135deg,#e11d48,#9333ea)' }}>
                  🚀 Start Render
                </button>
              </>
            )}
          </div>

          {/* Re-render always visible when done/failed */}
          {(isDone || isFailed) && !isRendering && (
            <p className="text-xs text-center mt-4" style={{ color: 'var(--color-text-muted)' }}>
              Not happy with it? Go back to the <Link href={`/dashboard/v2/modules/movie-review/projects/${projectId}/editor`} className="underline">editor</Link> and make changes, then re-render.
            </p>
          )}
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}
