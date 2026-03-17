'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import Link from 'next/link';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://api.tavarios.com').replace(/\/$/, '');

function getAuthHeaders() {
  if (typeof document === 'undefined') return {};
  const token = document.cookie.split(';').find(c => c.trim().startsWith('token='))?.split('=')[1];
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}
function getBusinessId() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('activeBusinessId') || localStorage.getItem('businessId');
}

const RENDER_STEPS = [
  { label: 'Getting your background ready...', emoji: '🖼️', duration: 8 },
  { label: 'Adding your question and answers...', emoji: '✏️', duration: 15 },
  { label: 'Recording the voice...', emoji: '🎙️', duration: 20 },
  { label: 'Putting the video together...', emoji: '🎬', duration: 25 },
  { label: 'Almost done! Saving your video...', emoji: '💾', duration: 10 },
];

export default function RenderPage() {
  const router = useRouter();
  const { id } = useParams();
  const [status, setStatus] = useState(null);
  const [render, setRender] = useState(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const pollRef = useRef(null);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);

  useEffect(() => { checkStatus(); return () => { clearInterval(pollRef.current); clearInterval(timerRef.current); }; }, [id]);

  async function checkStatus() {
    try {
      const headers = { ...getAuthHeaders(), 'X-Active-Business-Id': getBusinessId() };
      const res = await fetch(`${API_URL}/api/v2/kidquiz/projects/${id}/render-status`, { headers });
      const data = await res.json();
      setStatus(data.project_status);
      setRender(data.render);
      if (data.project_status === 'READY') { clearInterval(pollRef.current); clearInterval(timerRef.current); }
    } catch (err) { setError(err.message); }
  }

  function startProgressTimer() {
    startTimeRef.current = Date.now();
    setElapsedSeconds(0);
    setStepIndex(0);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setElapsedSeconds(elapsed);
      // Advance step based on cumulative durations
      let cum = 0;
      for (let i = 0; i < RENDER_STEPS.length; i++) {
        cum += RENDER_STEPS[i].duration;
        if (elapsed < cum) { setStepIndex(i); break; }
        if (i === RENDER_STEPS.length - 1) setStepIndex(i);
      }
    }, 1000);
  }

  async function startRender() {
    setRendering(true); setError(null);
    try {
      const headers = { ...getAuthHeaders(), 'X-Active-Business-Id': getBusinessId() };
      await fetch(`${API_URL}/api/v2/kidquiz/projects/${id}/render-reset`, { method: 'POST', headers });
      const res = await fetch(`${API_URL}/api/v2/kidquiz/projects/${id}/render`, { method: 'POST', headers });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Render failed to start'); }
      setStatus('RENDERING');
      setRendering(false);
      startProgressTimer();
      clearInterval(pollRef.current);
      pollRef.current = setInterval(checkStatus, 3000);
    } catch (err) { setError(err.message); setRendering(false); }
  }

  const isReady = status === 'READY';
  const isActivelyRendering = status === 'RENDERING' && !rendering;
  // Show restart button for FAILED, RENDERING (stuck), APPROVED — always available
  const showRestartButton = status === 'FAILED' || status === 'RENDERING';
  const showStartButton = status === 'APPROVED';

  return (
    <AuthGuard>
      <V2AppShell>
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px' }}>
          <Link href="/dashboard/v2/modules/kidquiz/dashboard" className="text-sm mb-4 inline-block" style={{ color: 'var(--color-text-muted)' }}>
            &larr; Back
          </Link>

          <div className="flex items-center mb-4" style={{ gap: 2, minWidth: 0 }}>
            {['Topic', 'Build Quiz', 'Review', 'Render', 'Upload'].map((step, i) => (
              <span key={step} className="flex items-center" style={{ gap: 2, minWidth: 0, flex: '1 1 0' }}>
                <span
                  className="font-semibold text-center truncate"
                  style={{
                    fontSize: 11, padding: '4px 6px', borderRadius: 999, width: '100%',
                    background: i === 3 ? '#6366f1' : '#f3f4f6',
                    color: i === 3 ? '#fff' : '#9ca3af',
                  }}
                >{step}</span>
                {i < 4 && <span style={{ color: '#d1d5db', flexShrink: 0, fontSize: 12 }}>›</span>}
              </span>
            ))}
          </div>

          <div className="rounded-2xl p-6" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text-main)' }}>Render Video</h1>
            <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
              This creates your 11-second YouTube Short. It takes about 60-90 seconds.
            </p>

            {error && <div className="p-3 mb-4 rounded-lg text-sm" style={{ background: '#fee2e2', color: '#dc2626' }}>{error}</div>}

            {/* Status indicator */}
            {isActivelyRendering && (
              <div className="rounded-xl p-6 mb-6 text-center" style={{ background: '#ede9fe' }}>
                <div className="text-5xl mb-3">{RENDER_STEPS[stepIndex].emoji}</div>
                <p className="font-bold text-lg mb-1" style={{ color: '#6366f1' }}>{RENDER_STEPS[stepIndex].label}</p>
                <p className="text-sm mb-4" style={{ color: '#6b7280' }}>This takes about 60–90 seconds. Keep waiting! ⏳</p>
                {/* Overall progress bar */}
                <div className="h-4 rounded-full overflow-hidden mb-2" style={{ background: '#e5e7eb' }}>
                  <div
                    className="h-full rounded-full transition-all duration-1000"
                    style={{ background: 'linear-gradient(90deg, #6366f1, #ec4899)', width: `${Math.min(95, (elapsedSeconds / 78) * 100)}%` }}
                  />
                </div>
                {/* Step dots */}
                <div className="flex justify-center gap-2 mt-3">
                  {RENDER_STEPS.map((s, i) => (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <div className="w-3 h-3 rounded-full transition-all" style={{ background: i <= stepIndex ? '#6366f1' : '#e5e7eb' }} />
                    </div>
                  ))}
                </div>
                <p className="text-xs mt-3" style={{ color: '#9ca3af' }}>Step {stepIndex + 1} of {RENDER_STEPS.length}</p>
              </div>
            )}

            {rendering && (
              <div className="rounded-xl p-6 mb-6 text-center" style={{ background: '#ede9fe' }}>
                <div className="text-5xl mb-3">🚀</div>
                <p className="font-bold text-lg" style={{ color: '#6366f1' }}>Starting your render...</p>
              </div>
            )}

            {status === 'FAILED' && !rendering && (
              <div className="rounded-xl p-5 mb-6 text-center" style={{ background: '#fee2e2' }}>
                <div className="text-4xl mb-3">❌</div>
                <p className="font-bold text-base" style={{ color: '#dc2626' }}>Something went wrong</p>
                <p className="text-sm mt-1" style={{ color: '#6b7280' }}>Tap Restart Render to try again!</p>
              </div>
            )}

            {isReady && (
              <div className="rounded-xl p-6 mb-6 text-center" style={{ background: '#f0fdf4' }}>
                <div className="text-5xl mb-3">🎉</div>
                <p className="font-bold text-lg mb-1" style={{ color: '#16a34a' }}>Your video is ready!</p>
                {render?.output_url && (
                  <a href={render.output_url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold underline" style={{ color: '#6366f1' }}>
                    Preview video
                  </a>
                )}
              </div>
            )}

            {status === 'APPROVED' && !rendering && (
              <div className="rounded-xl p-5 mb-6 text-center" style={{ background: '#f9fafb' }}>
                <div className="text-4xl mb-3">🎬</div>
                <p className="text-sm" style={{ color: '#6b7280' }}>Ready to make your video! Tap the button below.</p>
              </div>
            )}

            {/* Start Rendering — only when APPROVED */}
            {status === 'APPROVED' && (
              <button onClick={startRender} disabled={rendering} className="w-full py-4 rounded-xl font-bold text-white text-base mb-3" style={{ background: 'linear-gradient(135deg, #6366f1, #ec4899)', opacity: rendering ? 0.6 : 1 }}>
                {rendering ? 'Starting...' : 'Start Rendering'}
              </button>
            )}

            {/* Restart/Re-render — visible when not actively rendering or approved-fresh */}
            {status !== 'APPROVED' && !isActivelyRendering && !rendering && (
              <button onClick={startRender} className="w-full py-4 rounded-xl font-bold text-white text-base mb-3" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
                🔄 {status === 'READY' || status === 'PUBLISHED' ? 'Re-render Video' : 'Restart Render'}
              </button>
            )}

            {/* Force Re-render — always visible even while rendering (server crash recovery) */}
            {isActivelyRendering && !rendering && (
              <button onClick={startRender} className="w-full py-3 rounded-xl font-semibold text-sm mt-2" style={{ background: 'transparent', border: '1px solid #dc2626', color: '#dc2626' }}>
                ⚠️ Force Re-render (server crashed?)
              </button>
            )}

            {isReady && (
              <button onClick={() => router.push(`/dashboard/v2/modules/kidquiz/projects/${id}/upload`)} className="w-full py-4 rounded-xl font-bold text-white text-base mb-2" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                Next: Upload to YouTube
              </button>
            )}

            {/* Always visible — go back to editor to swap background image then re-render */}
            <button
              onClick={() => router.push(`/dashboard/v2/modules/kidquiz/projects/${id}/editor`)}
              className="w-full py-3 rounded-xl font-semibold text-sm"
              style={{ background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}
            >
              🖼️ Change Background Image
            </button>
          </div>
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}
