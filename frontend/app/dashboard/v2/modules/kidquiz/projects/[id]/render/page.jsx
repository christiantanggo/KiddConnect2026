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

      if (data.project_status === 'READY') {
        clearInterval(pollRef.current);
      } else if (data.project_status === 'RENDERING') {
        if (!pollRef.current) {
          pollRef.current = setInterval(checkStatus, 3000);
        }
      }
    } catch (err) { setError(err.message); }
  }

  async function startRender() {
    setRendering(true); setError(null);
    try {
      const headers = { ...getAuthHeaders(), 'X-Active-Business-Id': getBusinessId() };
      const res = await fetch(`${API_URL}/api/v2/kidquiz/projects/${id}/render`, { method: 'POST', headers });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Render failed to start');
      }
      setStatus('RENDERING');
      pollRef.current = setInterval(checkStatus, 3000);
    } catch (err) { setError(err.message); setRendering(false); }
  }

  const isRendering = status === 'RENDERING';
  const isReady = status === 'READY';
  const isFailed = status === 'FAILED';
  const canStart = ['APPROVED', 'FAILED'].includes(status);

  return (
    <AuthGuard>
      <V2AppShell>
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px' }}>
          <Link href="/dashboard/v2/modules/kidquiz/dashboard" className="text-sm mb-4 inline-block" style={{ color: 'var(--color-text-muted)' }}>â† Back</Link>

          <div className="flex items-center gap-2 mb-6 text-xs font-semibold flex-wrap">
            {['Topic', 'Build Quiz', 'Review', 'Render', 'Upload'].map((step, i) => (
              <span key={step} className="flex items-center gap-2">
                <span className="px-2 py-1 rounded-full" style={{ background: i === 3 ? '#6366f1' : '#f3f4f6', color: i === 3 ? '#fff' : '#9ca3af' }}>{step}</span>
                {i < 4 && <span style={{ color: '#d1d5db' }}>â€º</span>}
              </span>
            ))}
          </div>

          <div className="rounded-2xl p-6" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text-main)' }}>ðŸŽ¬ Render Video</h1>
            <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
              This creates your 11-second YouTube Short. It takes about 60â€“90 seconds.
            </p>

            {error && <div className="p-3 mb-4 rounded-lg text-sm" style={{ background: '#fee2e2', color: '#dc2626' }}>{error}</div>}

            {/* Status indicator */}
            <div className="rounded-xl p-5 mb-6 text-center" style={{ background: isReady ? '#f0fdf4' : isRendering ? '#ede9fe' : isFailed ? '#fee2e2' : '#f9fafb' }}>
              {isRendering && (
                <>
                  <div className="text-4xl mb-3">âš™ï¸</div>
                  <p className="font-bold text-base mb-1" style={{ color: '#6366f1' }}>Rendering your videoâ€¦</p>
                  <p className="text-sm" style={{ color: '#6b7280' }}>This takes about 60â€“90 seconds. Hold tight!</p>
                  <div className="mt-4 h-2 rounded-full overflow-hidden" style={{ background: '#e5e7eb' }}>
                    <div className="h-full rounded-full animate-pulse" style={{ background: 'linear-gradient(90deg, #6366f1, #ec4899)', width: '60%' }} />
                  </div>
                </>
              )}
              {isReady && (
                <>
                  <div className="text-4xl mb-3">âœ…</div>
                  <p className="font-bold text-base mb-1" style={{ color: '#16a34a' }}>Video ready!</p>
                  {render?.output_url && (
                    <a href={render.output_url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold underline" style={{ color: '#6366f1' }}>
                      Preview video â†—
                    </a>
                  )}
                </>
              )}
              {isFailed && (
                <>
                  <div className="text-4xl mb-3">âŒ</div>
                  <p className="font-bold text-base" style={{ color: '#dc2626' }}>Render failed</p>
                  {render?.step_error && <p className="text-xs mt-1" style={{ color: '#6b7280' }}>{render.step_error}</p>}
                </>
              )}
              {!isRendering && !isReady && !isFailed && canStart && (
                <>
                  <div className="text-4xl mb-3">ðŸŽ¬</div>
                  <p className="text-sm" style={{ color: '#6b7280' }}>Click below to start rendering your video</p>
                </>
              )}
            </div>

            {canStart && (
              <button onClick={startRender} disabled={rendering || isRendering} className="w-full py-4 rounded-xl font-bold text-white text-base" style={{ background: 'linear-gradient(135deg, #6366f1, #ec4899)', opacity: (rendering || isRendering) ? 0.6 : 1 }}>
                {rendering ? 'Startingâ€¦' : isFailed ? 'ðŸ”„ Try Again' : 'ðŸŽ¬ Start Rendering'}
              </button>
            )}

            {isReady && (
              <button onClick={() => router.push(`/dashboard/v2/modules/kidquiz/projects/${id}/upload`)} className="w-full py-4 rounded-xl font-bold text-white text-base" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                Next: Upload to YouTube â†’
              </button>
            )}
          </div>
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}