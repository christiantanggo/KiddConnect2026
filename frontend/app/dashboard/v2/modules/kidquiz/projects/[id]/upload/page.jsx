'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
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

export default function UploadPage() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [publish, setPublish] = useState(null);
  const [ytStatus, setYtStatus] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [pollTimer, setPollTimer] = useState(null);

  useEffect(() => {
    loadData();
    return () => { if (pollTimer) clearInterval(pollTimer); };
  }, [id]);

  async function loadData() {
    try {
      const headers = { ...getAuthHeaders(), 'X-Active-Business-Id': getBusinessId() };
      const [projRes, ytRes, uploadRes] = await Promise.all([
        fetch(`${API_URL}/api/v2/kidquiz/projects/${id}`, { headers }),
        fetch(`${API_URL}/api/v2/kidquiz/youtube/status`, { headers }),
        fetch(`${API_URL}/api/v2/kidquiz/projects/${id}/upload-status`, { headers }),
      ]);
      const projData = await projRes.json();
      const ytData = await ytRes.json();
      const uploadData = await uploadRes.json();
      setProject(projData.project);
      setYtStatus(ytData);
      setPublish(uploadData.publish);
    } catch (err) { setError(err.message); }
  }

  async function connectYouTube() {
    try {
      const headers = { ...getAuthHeaders(), 'X-Active-Business-Id': getBusinessId() };
      const res = await fetch(`${API_URL}/api/v2/kidquiz/youtube/auth-url`, { headers });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (err) { setError(err.message); }
  }

  async function startUpload() {
    setUploading(true); setError(null);
    try {
      const headers = { ...getAuthHeaders(), 'X-Active-Business-Id': getBusinessId() };
      const res = await fetch(`${API_URL}/api/v2/kidquiz/projects/${id}/upload`, { method: 'POST', headers });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Upload failed'); }
      // Poll for result
      const t = setInterval(async () => {
        const statusRes = await fetch(`${API_URL}/api/v2/kidquiz/projects/${id}/upload-status`, { headers });
        const statusData = await statusRes.json();
        setPublish(statusData.publish);
        if (['PUBLISHED', 'FAILED'].includes(statusData.publish?.publish_status)) {
          clearInterval(t); setUploading(false);
        }
      }, 3000);
      setPollTimer(t);
    } catch (err) { setError(err.message); setUploading(false); }
  }

  const isPublished = project?.status === 'PUBLISHED' || publish?.publish_status === 'PUBLISHED';
  const isUploading = project?.status === 'UPLOADING' || publish?.publish_status === 'UPLOADING' || uploading;
  const canUpload = project?.status === 'READY' && ytStatus?.connected;

  return (
    <AuthGuard>
      <V2AppShell>
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px' }}>
          <Link href="/dashboard/v2/modules/kidquiz/dashboard" className="text-sm mb-4 inline-block" style={{ color: 'var(--color-text-muted)' }}>â† Back</Link>

          <div className="flex items-center gap-2 mb-6 text-xs font-semibold flex-wrap">
            {['Topic', 'Build Quiz', 'Review', 'Render', 'Upload'].map((step, i) => (
              <span key={step} className="flex items-center gap-2">
                <span className="px-2 py-1 rounded-full" style={{ background: i === 4 ? '#6366f1' : '#f3f4f6', color: i === 4 ? '#fff' : '#9ca3af' }}>{step}</span>
                {i < 4 && <span style={{ color: '#d1d5db' }}>â€º</span>}
              </span>
            ))}
          </div>

          <div className="space-y-5">
            {error && <div className="p-3 rounded-lg text-sm" style={{ background: '#fee2e2', color: '#dc2626' }}>{error}</div>}

            {/* YouTube connection status */}
            <div className="rounded-2xl p-5" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <h2 className="font-bold text-base mb-3" style={{ color: 'var(--color-text-main)' }}>ðŸ“º YouTube Connection</h2>
              {ytStatus?.connected ? (
                <div className="flex items-center gap-3">
                  <span className="text-2xl">âœ…</span>
                  <div>
                    <p className="font-semibold text-sm" style={{ color: 'var(--color-text-main)' }}>Connected: {ytStatus.channel_title}</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Ready to upload</p>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-sm mb-3" style={{ color: 'var(--color-text-muted)' }}>Connect your son's YouTube channel to upload videos.</p>
                  <button onClick={connectYouTube} className="px-4 py-2.5 rounded-xl font-bold text-white text-sm" style={{ background: '#ef4444' }}>
                    ðŸ”´ Connect YouTube
                  </button>
                </div>
              )}
            </div>

            {/* Upload status */}
            <div className="rounded-2xl p-5" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <h2 className="font-bold text-base mb-4" style={{ color: 'var(--color-text-main)' }}>ðŸš€ Upload to YouTube</h2>

              {isPublished && (
                <div className="text-center py-4">
                  <div className="text-5xl mb-3">ðŸŽ‰</div>
                  <p className="font-bold text-lg mb-2" style={{ color: '#16a34a' }}>Published!</p>
                  {publish?.youtube_url && (
                    <a href={publish.youtube_url} target="_blank" rel="noopener noreferrer" className="inline-block px-5 py-2.5 rounded-xl font-bold text-white text-sm" style={{ background: '#ef4444' }}>
                      Watch on YouTube â†—
                    </a>
                  )}
                </div>
              )}

              {isUploading && !isPublished && (
                <div className="text-center py-4">
                  <div className="text-4xl mb-2">â¬†ï¸</div>
                  <p className="font-semibold" style={{ color: '#6366f1' }}>Uploading to YouTubeâ€¦ this may take a minute.</p>
                </div>
              )}

              {!isPublished && !isUploading && (
                <button
                  onClick={startUpload}
                  disabled={!canUpload}
                  className="w-full py-4 rounded-xl font-bold text-white text-base"
                  style={{ background: canUpload ? 'linear-gradient(135deg, #ef4444, #dc2626)' : '#9ca3af', cursor: canUpload ? 'pointer' : 'not-allowed' }}
                >
                  ðŸ”´ Upload to YouTube
                </button>
              )}

              {!canUpload && !isPublished && !isUploading && (
                <p className="text-xs mt-2 text-center" style={{ color: '#9ca3af' }}>
                  {!ytStatus?.connected ? 'Connect YouTube first' : 'Render the video first'}
                </p>
              )}
            </div>

            <Link href="/dashboard/v2/modules/kidquiz/dashboard" className="block text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
              â† Back to all quizzes
            </Link>
          </div>
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}