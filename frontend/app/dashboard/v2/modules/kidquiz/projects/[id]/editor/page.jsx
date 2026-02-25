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

const LABELS = ['A', 'B', 'C'];

export default function EditorPage() {
  const router = useRouter();
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [questionText, setQuestionText] = useState('');
  const [answers, setAnswers] = useState([
    { label: 'A', answer_text: '', is_correct: false },
    { label: 'B', answer_text: '', is_correct: false },
    { label: 'C', answer_text: '', is_correct: false },
  ]);
  const [timerSeconds, setTimerSeconds] = useState(6);
  const [cleaning, setCleaning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => { loadProject(); }, [id]);

  async function loadProject() {
    try {
      const headers = { ...getAuthHeaders(), 'X-Active-Business-Id': getBusinessId() };
      const res = await fetch(`${API_URL}/api/v2/kidquiz/projects/${id}`, { headers });
      if (!res.ok) throw new Error('Project not found');
      const data = await res.json();
      setProject(data.project);
      setPhotoUrl(data.project.photo_url || null);
      const q = data.project.questions?.[0];
      if (q) {
        setQuestionText(q.question_text || '');
        setTimerSeconds(q.timer_seconds || 6);
        if (q.answers?.length > 0) {
          const restored = LABELS.map(lbl => {
            const existing = q.answers.find(a => a.label === lbl);
            return { label: lbl, answer_text: existing?.answer_text || '', is_correct: existing?.is_correct || false };
          });
          setAnswers(restored);
        }
      }
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  function setAnswerText(label, text) {
    setAnswers(prev => prev.map(a => a.label === label ? { ...a, answer_text: text } : a));
  }
  function setCorrect(label) {
    setAnswers(prev => prev.map(a => ({ ...a, is_correct: a.label === label })));
  }

  async function autoClean() {
    if (!questionText.trim()) return;
    setCleaning(true);
    try {
      const headers = { ...getAuthHeaders(), 'X-Active-Business-Id': getBusinessId() };
      const allText = [questionText, ...answers.map(a => a.answer_text)].join('\n');
      const res = await fetch(`${API_URL}/api/v2/kidquiz/text/clean`, {
        method: 'POST', headers, body: JSON.stringify({ text: allText })
      });
      const data = await res.json();
      const lines = (data.cleanedText || allText).split('\n');
      if (lines[0]) setQuestionText(lines[0]);
      setAnswers(prev => prev.map((a, i) => ({ ...a, answer_text: lines[i + 1] !== undefined ? lines[i + 1] : a.answer_text })));
    } catch (err) { console.warn('Clean failed:', err.message); }
    finally { setCleaning(false); }
  }

  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const token = document.cookie.split(';').find(c => c.trim().startsWith('token='))?.split('=')[1];
      const businessId = localStorage.getItem('activeBusinessId') || localStorage.getItem('businessId');
      const formData = new FormData();
      formData.append('photo', file);
      const res = await fetch(`${API_URL}/api/v2/kidquiz/projects/${id}/photo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'X-Active-Business-Id': businessId },
        body: formData,
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Photo upload failed'); }
      const data = await res.json();
      setPhotoUrl(data.photo_url);
    } catch (err) { setError(err.message); }
    finally { setUploadingPhoto(false); }
  }

  async function handleSave() {
    setError(null);
    if (!questionText.trim()) { setError('Please enter your question!'); return; }
    if (answers.some(a => !a.answer_text.trim())) { setError('Fill in all three answer options!'); return; }
    if (!answers.some(a => a.is_correct)) { setError('Tap the circle next to the correct answer to mark it!'); return; }
    setSaving(true);
    try {
      const headers = { ...getAuthHeaders(), 'X-Active-Business-Id': getBusinessId() };
      const res = await fetch(`${API_URL}/api/v2/kidquiz/projects/${id}/questions`, {
        method: 'POST', headers,
        body: JSON.stringify({ question_text: questionText.trim(), timer_seconds: timerSeconds, answers })
      });
      if (!res.ok) throw new Error(await res.text());
      router.push(`/dashboard/v2/modules/kidquiz/projects/${id}/review`);
    } catch (err) { setError(err.message); setSaving(false); }
  }

  if (loading) return <AuthGuard><V2AppShell><div className="text-center py-20" style={{ color: 'var(--color-text-muted)' }}>Loading...</div></V2AppShell></AuthGuard>;

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
                <span className="px-2 py-1 rounded-full" style={{ background: i === 1 ? '#6366f1' : '#f3f4f6', color: i === 1 ? '#fff' : '#9ca3af' }}>{step}</span>
                {i < 4 && <span style={{ color: '#d1d5db' }}>&rsaquo;</span>}
              </span>
            ))}
          </div>

          <div className="rounded-2xl p-6" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <div className="mb-2 flex items-center justify-between">
              <h1 className="text-xl font-bold" style={{ color: 'var(--color-text-main)' }}>Build Your Question</h1>
              <span className="text-xs px-2 py-1 rounded-full" style={{ background: '#ede9fe', color: '#6366f1' }}>{project?.category}</span>
            </div>
            <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>Topic: <strong>{project?.topic}</strong></p>

            {error && <div className="p-3 mb-4 rounded-lg text-sm font-semibold" style={{ background: '#fee2e2', color: '#dc2626' }}>{error}</div>}

            {/* Photo upload */}
            <div className="mb-5">
              <label className="block text-sm font-bold mb-2" style={{ color: 'var(--color-text-main)' }}>Background Photo</label>
              <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>Upload a photo related to your quiz topic — it appears as the video background. If you skip this, a default background is used.</p>
              <label className="flex items-center gap-3 cursor-pointer">
                <div className="px-4 py-2.5 rounded-xl font-semibold text-sm border" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)', background: 'var(--color-background)' }}>
                  {uploadingPhoto ? 'Uploading...' : photoUrl ? 'Change Photo' : 'Upload Photo'}
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploadingPhoto} />
                {photoUrl && !uploadingPhoto && <span className="text-xs" style={{ color: '#10b981' }}>✓ Photo uploaded</span>}
                {uploadingPhoto && <span className="text-xs" style={{ color: '#6366f1' }}>Uploading...</span>}
              </label>
              {photoUrl && (
                <div className="mt-3 rounded-xl overflow-hidden" style={{ height: 120, background: '#f3f4f6' }}>
                  <img src={photoUrl} alt="Background preview" className="w-full h-full object-cover" />
                </div>
              )}
            </div>

            <div className="mb-5">
              <label className="block text-sm font-bold mb-2" style={{ color: 'var(--color-text-main)' }}>Your Question *</label>
              <textarea
                value={questionText} onChange={e => setQuestionText(e.target.value)}
                placeholder="e.g. How fast can a cheetah run?" rows={3}
                className="w-full px-4 py-3 rounded-xl border text-base resize-none"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-background)', color: 'var(--color-text-main)' }}
                maxLength={200}
              />
            </div>

            <div className="mb-5">
              <label className="block text-sm font-bold mb-3" style={{ color: 'var(--color-text-main)' }}>
                Answer Options &mdash; tap the circle to mark the correct one
              </label>
              <div className="space-y-3">
                {answers.map(ans => (
                  <div key={ans.label} className="flex items-center gap-3">
                    <button
                      onClick={() => setCorrect(ans.label)}
                      className="flex-shrink-0 w-9 h-9 rounded-full border-2 text-sm font-bold transition-all"
                      style={{
                        borderColor: ans.is_correct ? '#10b981' : 'var(--color-border)',
                        background: ans.is_correct ? '#10b981' : 'transparent',
                        color: ans.is_correct ? '#fff' : 'var(--color-text-muted)',
                      }}
                    >{ans.is_correct ? '✓' : ans.label}</button>
                    <input
                      type="text" value={ans.answer_text} onChange={e => setAnswerText(ans.label, e.target.value)}
                      placeholder={`Option ${ans.label}`}
                      className="flex-1 px-4 py-2.5 rounded-xl border text-base"
                      style={{
                        borderColor: ans.is_correct ? '#10b981' : 'var(--color-border)',
                        background: ans.is_correct ? '#f0fdf4' : 'var(--color-background)',
                        color: 'var(--color-text-main)',
                      }}
                      maxLength={120}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-bold mb-2" style={{ color: 'var(--color-text-main)' }}>Countdown Timer: {timerSeconds}s</label>
              <input type="range" min={3} max={10} value={timerSeconds} onChange={e => setTimerSeconds(Number(e.target.value))} className="w-full" />
              <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}><span>3s (fast)</span><span>10s (slow)</span></div>
            </div>

            <div className="flex gap-3">
              <button onClick={autoClean} disabled={cleaning} className="flex-1 py-3 rounded-xl font-semibold text-sm border" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
                {cleaning ? 'Fixing...' : 'Fix Spelling'}
              </button>
              <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl font-bold text-white text-base" style={{ background: 'linear-gradient(135deg, #6366f1, #ec4899)', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving...' : 'Next: Review'}
              </button>
            </div>
          </div>
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}
