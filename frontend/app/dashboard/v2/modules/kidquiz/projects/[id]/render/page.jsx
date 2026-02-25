'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import Link from 'next/link';

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

export default function RenderPage() {
  const router = useRouter();
  const { id } = useParams();
  const [status, setStatus] = useState(null);
  const [render, setRender] = useState(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => { checkStatus(); return () => clearInterval(pollRef.current); }, [id]);

  async function checkStatus() {
    try {
      const headers = { ...getAuthHeaders(), 'X-Active-Business-Id': getBusinessId() };
      const res = await fetch(`${API_URL}/api/v2/kidquiz/projects/${id}/render-status`, { headers });
      const data = await res.json();
      setStatus(data.project_status);
      setRender(data.render);
      if (data.project_status === 'READY') clearInterval(pollRef.current);
    } catch (err) { setError(err.message); }
  }

  async function startRender() {
    setRendering(true); setError(null);
    try {
      const headers = { ...getAuthHeaders(), 'X-Active-Business-Id': getBusinessId() };
      await fetch(`${API_URL}/api/v2/kidquiz/projects/${id}/render-reset`, { method: 'POST', headers });
      const res = await fetch(`${API_URL}/api/v2/kidquiz/projects/${id}/render`, { method: 'POST', headers });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Render failed to start'); }
      setStatus('RENDERING');
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

          <div className="flex items-center gap-2 mb-6 text-xs font-semibold flex-wrap">
            {['Topic', 'Build Quiz', 'Review', 'Render', 'Upload'].map((step, i) => (
              <span key={step} className="flex items-center gap-2">
                <span className="px-2 py-1 rounded-full" style={{ background: i === 3 ? '#6366f1' : '#f3f4f6', color: i === 3 ? '#fff' : '#9ca3af' }}>{step}</span>
                {i < 4 && <span style={{ color: '#d1d5db' }}>&rsaquo;</span>}
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
            <div className="rounded-xl p-5 mb-6 text-center" style={{ background: isReady ? '#f0fdf4' : isActivelyRendering ? '#ede9fe' : status === 'FAILED' ? '#fee2e2' : status === 'RENDERING' ? '#fee2e2' : '#f9fafb' }}>
              {isActivelyRendering && (
                <>
                  <div className="text-4xl mb-3">&#x2699;&#xFE0F;</div>
                  <p className="font-bold text-base mb-1" style={{ color: '#6366f1' }}>Rendering your video...</p>
                  <p className="text-sm" style={{ color: '#6b7280' }}>This takes about 60-90 seconds. Hold tight!</p>
                  <div className="mt-4 h-2 rounded-full overflow-hidden" style={{ background: '#e5e7eb' }}>
                    <div className="h-full rounded-full animate-pulse" style={{ background: 'linear-gradient(90deg, #6366f1, #ec4899)', width: '60%' }} />
                  </div>
                </>
              )}
              {status === 'RENDERING' && rendering && (
                <>
                  <div className="text-4xl mb-3">&#x2699;&#xFE0F;</div>
                  <p className="font-bold text-base mb-1" style={{ color: '#6366f1' }}>Starting render...</p>
                </>
              )}
              {status === 'FAILED' && (
                <>
                  <div className="text-4xl mb-3">&#x274C;</div>
                  <p className="font-bold text-base" style={{ color: '#dc2626' }}>Render failed</p>
                  {render?.step_error && <p className="text-xs mt-1" style={{ color: '#6b7280' }}>{render.step_error}</p>}
                </>
              )}
              {isReady && (
                <>
                  <div className="text-4xl mb-3">&#x2705;</div>
                  <p className="font-bold text-base mb-1" style={{ color: '#16a34a' }}>Video ready!</p>
                  {render?.output_url && (
                    <a href={render.output_url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold underline" style={{ color: '#6366f1' }}>
                      Preview video
                    </a>
                  )}
                </>
              )}
              {status === 'APPROVED' && (
                <>
                  <div className="text-4xl mb-3">&#x1F3AC;</div>
                  <p className="text-sm" style={{ color: '#6b7280' }}>Click below to start rendering your video</p>
                </>
              )}
            </div>

            {showRestartButton && (
              <button onClick={startRender} disabled={rendering} className="w-full py-4 rounded-xl font-bold text-white text-base" style={{ background: rendering ? '#9ca3af' : 'linear-gradient(135deg, #ef4444, #dc2626)', cursor: rendering ? 'not-allowed' : 'pointer' }}>
                {rendering ? 'Starting...' : '🔄 Restart Render'}
              </button>
            )}

            {showStartButton && (
              <button onClick={startRender} disabled={rendering} className="w-full py-4 rounded-xl font-bold text-white text-base" style={{ background: 'linear-gradient(135deg, #6366f1, #ec4899)', opacity: rendering ? 0.6 : 1 }}>
                {rendering ? 'Starting...' : 'Start Rendering'}
              </button>
            )}

            {isReady && (
              <button onClick={() => router.push(`/dashboard/v2/modules/kidquiz/projects/${id}/upload`)} className="w-full py-4 rounded-xl font-bold text-white text-base" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                Next: Upload to YouTube
              </button>
            )}
          </div>
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}
