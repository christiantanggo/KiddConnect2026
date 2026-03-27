'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import Link from 'next/link';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://api.kiddconnect.ca').replace(/\/$/, '');

const CATEGORIES = [
  { id: 'animals',    emoji: '🦁', label: 'Animals' },
  { id: 'science',    emoji: '🔬', label: 'Science' },
  { id: 'geography',  emoji: '🌍', label: 'Geography' },
  { id: 'sports',     emoji: '⚽', label: 'Sports' },
  { id: 'history',    emoji: '🏛️',  label: 'History' },
  { id: 'math',       emoji: '🔢', label: 'Math' },
  { id: 'space',      emoji: '🚀', label: 'Space' },
  { id: 'food',       emoji: '🍕', label: 'Food' },
  { id: 'movies',     emoji: '🎬', label: 'Movies & TV' },
  { id: 'music',      emoji: '🎵', label: 'Music' },
  { id: 'gaming',     emoji: '🎮', label: 'Gaming' },
  { id: 'general',    emoji: '🧠', label: 'General' },
];

function getAuthHeaders() {
  if (typeof document === 'undefined') return {};
  const token = document.cookie.split(';').find(c => c.trim().startsWith('token='))?.split('=')[1];
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

function getBusinessId() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('activeBusinessId') || localStorage.getItem('businessId');
}

export default function NewProject() {
  const router = useRouter();
  const [topic, setTopic] = useState('');
  const [category, setCategory] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  async function handleCreate() {
    if (!topic.trim()) { setError('Please enter a topic!'); return; }
    if (!category) { setError('Please pick a category!'); return; }
    setError(null);
    setCreating(true);
    try {
      const headers = { ...getAuthHeaders(), 'X-Active-Business-Id': getBusinessId() };
      const res = await fetch(`${API_URL}/api/v2/kidquiz/projects`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ topic: topic.trim(), category })
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      router.push(`/dashboard/v2/modules/kidquiz/projects/${data.project.id}/editor`);
    } catch (err) {
      setError(err.message);
      setCreating(false);
    }
  }

  return (
    <AuthGuard>
      <V2AppShell>
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px' }}>
          <Link href="/dashboard/v2/modules/kidquiz/dashboard" className="text-sm mb-4 inline-block" style={{ color: 'var(--color-text-muted)' }}>
            ← Back to My Quizzes
          </Link>

          <div className="rounded-2xl p-6" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--color-text-main)' }}>
              🎯 New Quiz
            </h1>
            <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
              Choose a topic and category for your quiz Short
            </p>

            {error && (
              <div className="p-3 mb-4 rounded-lg text-sm font-semibold" style={{ background: '#fee2e2', color: '#dc2626' }}>
                {error}
              </div>
            )}

            {/* Topic input */}
            <div className="mb-6">
              <label className="block text-sm font-bold mb-2" style={{ color: 'var(--color-text-main)' }}>
                What is your quiz about? *
              </label>
              <input
                type="text"
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="e.g. How fast can a cheetah run?"
                className="w-full px-4 py-3 rounded-xl border text-base"
                style={{
                  borderColor: 'var(--color-border)',
                  background: 'var(--color-background)',
                  color: 'var(--color-text-main)',
                  outline: 'none',
                }}
                maxLength={200}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
              />
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{topic.length}/200</p>
            </div>

            {/* Category picker */}
            <div className="mb-8">
              <label className="block text-sm font-bold mb-3" style={{ color: 'var(--color-text-main)' }}>
                Pick a category *
              </label>
              <div className="grid grid-cols-3 gap-3">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setCategory(cat.id)}
                    className="flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all font-semibold text-sm"
                    style={{
                      borderColor: category === cat.id ? '#6366f1' : 'var(--color-border)',
                      background: category === cat.id ? '#ede9fe' : 'var(--color-surface)',
                      color: category === cat.id ? '#6366f1' : 'var(--color-text-main)',
                      transform: category === cat.id ? 'scale(1.05)' : 'scale(1)',
                    }}
                  >
                    <span className="text-2xl">{cat.emoji}</span>
                    <span>{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleCreate}
              disabled={creating || !topic.trim() || !category}
              className="w-full py-4 rounded-xl font-bold text-white text-lg transition-opacity"
              style={{
                background: 'linear-gradient(135deg, #6366f1, #ec4899)',
                opacity: (creating || !topic.trim() || !category) ? 0.5 : 1,
                cursor: (creating || !topic.trim() || !category) ? 'not-allowed' : 'pointer',
              }}
            >
              {creating ? 'Creating…' : 'Next: Build the Question →'}
            </button>
          </div>
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}
