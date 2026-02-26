'use client';

import { useEffect, useState } from 'react';
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

export default function ReviewPage() {
  const router = useRouter();
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generatingMeta, setGeneratingMeta] = useState(false);
  const [approving, setApproving] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editHook, setEditHook] = useState('');
  const [editPrivacy, setEditPrivacy] = useState('PUBLIC');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => { loadProject(); }, [id]);

  async function loadProject() {
    try {
      const headers = { ...getAuthHeaders(), 'X-Active-Business-Id': getBusinessId() };
      const res = await fetch(`${API_URL}/api/v2/kidquiz/projects/${id}`, { headers });
      const data = await res.json();
      const p = data.project;
      setProject(p);
      setEditTitle(p.generated_title || '');
      setEditDesc(p.generated_description || '');
      setEditHook(p.hook_text || '');
      setEditPrivacy(p.privacy || 'PUBLIC');
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function generateMeta() {
    setGeneratingMeta(true); setError(null);
    try {
      const headers = { ...getAuthHeaders(), 'X-Active-Business-Id': getBusinessId() };
      const res = await fetch(`${API_URL}/api/v2/kidquiz/ai/generate-metadata`, {
        method: 'POST', headers, body: JSON.stringify({ project_id: id })
      });
      const data = await res.json();
      if (data.title) setEditTitle(data.title);
      if (data.description) setEditDesc(data.description);
      if (data.hookText) setEditHook(data.hookText);
      setSuccess('AI generated new title, description, and hook!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) { setError(err.message); }
    finally { setGeneratingMeta(false); }
  }

  async function saveAndApprove() {
    setApproving(true); setError(null);
    try {
      const headers = { ...getAuthHeaders(), 'X-Active-Business-Id': getBusinessId() };
      await fetch(`${API_URL}/api/v2/kidquiz/projects/${id}`, {
        method: 'PUT', headers,
        body: JSON.stringify({ hook_text: editHook, generated_title: editTitle, generated_description: editDesc, privacy: editPrivacy })
      });
      await fetch(`${API_URL}/api/v2/kidquiz/projects/${id}/approve`, { method: 'POST', headers });
      router.push(`/dashboard/v2/modules/kidquiz/projects/${id}/render`);
    } catch (err) { setError(err.message); setApproving(false); }
  }

  if (loading) return <AuthGuard><V2AppShell><div className="text-center py-20" style={{ color: 'var(--color-text-muted)' }}>Loading...</div></V2AppShell></AuthGuard>;
  const q = project?.questions?.[0];
  const answers = q?.answers || [];

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
                    background: i === 2 ? '#6366f1' : '#f3f4f6',
                    color: i === 2 ? '#fff' : '#9ca3af',
                  }}
                >{step}</span>
                {i < 4 && <span style={{ color: '#d1d5db', flexShrink: 0, fontSize: 12 }}>›</span>}
              </span>
            ))}
          </div>

          {error && <div className="p-3 mb-4 rounded-lg text-sm" style={{ background: '#fee2e2', color: '#dc2626' }}>{error}</div>}
          {success && <div className="p-3 mb-4 rounded-lg text-sm" style={{ background: '#f0fdf4', color: '#16a34a' }}>{success}</div>}

          <div className="space-y-5">
            {/* Quiz Preview */}
            <div className="rounded-2xl p-5" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <h2 className="font-bold text-base mb-3" style={{ color: 'var(--color-text-main)' }}>Quiz Preview</h2>
              <div className="rounded-xl p-4 mb-3" style={{ background: '#1e1e2e' }}>
                <p className="text-white font-bold text-sm mb-3">{q?.question_text || 'No question yet'}</p>
                {answers.map(a => (
                  <div key={a.label} className="flex items-center gap-2 mb-1.5">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${a.is_correct ? 'bg-green-500 text-white' : 'bg-gray-600 text-gray-200'}`}>{a.is_correct ? '✓' : a.label}</span>
                    <span className="text-xs text-gray-200">{a.answer_text}</span>
                  </div>
                ))}
              </div>
              <Link href={`/dashboard/v2/modules/kidquiz/projects/${id}/editor`} className="text-xs font-semibold" style={{ color: '#6366f1' }}>
                Edit Question
              </Link>
            </div>

            {/* AI Metadata */}
            <div className="rounded-2xl p-5" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-base" style={{ color: 'var(--color-text-main)' }}>YouTube Metadata</h2>
                <button onClick={generateMeta} disabled={generatingMeta} className="text-xs px-3 py-1.5 rounded-lg font-semibold text-white" style={{ background: generatingMeta ? '#9ca3af' : '#6366f1' }}>
                  {generatingMeta ? 'Generating...' : 'AI Generate'}
                </button>
              </div>

              <div className="mb-4">
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-text-muted)' }}>Hook (first second of video)</label>
                <input type="text" value={editHook} onChange={e => setEditHook(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--color-border)', background: 'var(--color-background)', color: 'var(--color-text-main)' }} maxLength={100} />
              </div>
              <div className="mb-4">
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-text-muted)' }}>YouTube Title</label>
                <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--color-border)', background: 'var(--color-background)', color: 'var(--color-text-main)' }} maxLength={100} />
              </div>
              <div className="mb-4">
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-text-muted)' }}>Description</label>
                <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-lg border text-sm resize-none" style={{ borderColor: 'var(--color-border)', background: 'var(--color-background)', color: 'var(--color-text-main)' }} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-text-muted)' }}>Privacy</label>
                <select value={editPrivacy} onChange={e => setEditPrivacy(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--color-border)', background: 'var(--color-background)', color: 'var(--color-text-main)' }}>
                  <option value="PUBLIC">Public</option>
                  <option value="UNLISTED">Unlisted</option>
                  <option value="PRIVATE">Private</option>
                </select>
              </div>
            </div>

            <button onClick={saveAndApprove} disabled={approving} className="w-full py-4 rounded-xl font-bold text-white text-lg" style={{ background: 'linear-gradient(135deg, #6366f1, #ec4899)', opacity: approving ? 0.7 : 1 }}>
              {approving ? 'Approving...' : 'Approve & Render Video'}
            </button>
          </div>
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}
