'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import { Search, Film, X, ChevronLeft } from 'lucide-react';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://api.kiddconnect.ca').replace(/\/$/, '');

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

const CONTENT_TYPES = [
  { key: 'review',  label: '🎬 Review',   desc: 'Your take on a movie' },
  { key: 'facts',   label: '🤓 Facts',    desc: 'Cool facts about a movie' },
  { key: 'theory',  label: '🔍 Theory',   desc: 'A fan theory' },
  { key: 'ranking', label: '📊 Ranking',  desc: 'Rank movies or scenes' },
  { key: 'other',   label: '🎥 Other',    desc: 'Something else' },
];

export default function NewMovieReviewProject() {
  const router = useRouter();
  const [movieTitle, setMovieTitle] = useState('');
  const [contentType, setContentType] = useState('review');
  const [notes, setNotes] = useState('');
  const [tmdbResults, setTmdbResults] = useState([]);
  const [tmdbQuery, setTmdbQuery] = useState('');
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const [tmdbConfigured, setTmdbConfigured] = useState(true);
  const searchTimeout = useRef(null);

  useEffect(() => {
    // Quick check if TMDB is available
    checkTmdb();
  }, []);

  async function checkTmdb() {
    try {
      const res = await fetch(`${API_URL}/api/v2/movie-review/tmdb/search?q=test`, { headers: apiHeaders() });
      if (res.status === 500) {
        const d = await res.json();
        if (d.error?.includes('TMDB_API_KEY')) setTmdbConfigured(false);
      }
    } catch (_) {}
  }

  function handleTmdbSearch(q) {
    setTmdbQuery(q);
    if (!q.trim()) { setTmdbResults([]); return; }
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => doTmdbSearch(q), 500);
  }

  async function doTmdbSearch(q) {
    setSearching(true);
    try {
      const res = await fetch(`${API_URL}/api/v2/movie-review/tmdb/search?q=${encodeURIComponent(q)}`, { headers: apiHeaders() });
      const data = await res.json();
      setTmdbResults(data.results || []);
    } catch (_) {
      setTmdbResults([]);
    } finally {
      setSearching(false);
    }
  }

  function selectTmdbMovie(movie) {
    setSelectedMovie(movie);
    setMovieTitle(movie.title);
    setTmdbResults([]);
    setTmdbQuery('');
  }

  function clearMovie() {
    setSelectedMovie(null);
    setMovieTitle('');
  }

  async function createProject() {
    if (!movieTitle.trim()) { setError('Movie title is required'); return; }
    setCreating(true); setError(null);
    try {
      const body = {
        movie_title: movieTitle.trim(),
        content_type: contentType,
        notes_text: notes.trim() || null,
        tmdb_movie_id: selectedMovie?.id || null,
        tmdb_poster_url: selectedMovie?.poster_url || null,
      };
      const res = await fetch(`${API_URL}/api/v2/movie-review/projects`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create project');
      router.push(`/dashboard/v2/modules/movie-review/projects/${data.project.id}/editor`);
    } catch (err) {
      setError(err.message);
      setCreating(false);
    }
  }

  return (
    <AuthGuard>
      <V2AppShell>
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '16px' }}>
          <button onClick={() => router.push('/dashboard/v2/modules/movie-review/dashboard')}
            className="flex items-center gap-1.5 text-sm mb-4"
            style={{ color: 'var(--color-text-muted)' }}>
            <ChevronLeft className="w-4 h-4" /> Back to My Projects
          </button>

          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--color-text-main)' }}>🎬 New Project</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>Create a YouTube Short about a movie</p>

          {error && <div className="p-3 mb-4 rounded-lg text-sm" style={{ background: '#fee2e2', color: '#dc2626' }}>{error}</div>}

          <div className="space-y-5">
            {/* Movie selection */}
            <div className="rounded-2xl p-5" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <h2 className="font-bold text-base mb-3" style={{ color: 'var(--color-text-main)' }}>🎥 Movie</h2>

              {selectedMovie ? (
                <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--color-background)' }}>
                  {selectedMovie.poster_url && (
                    <img src={selectedMovie.poster_url} alt={selectedMovie.title}
                      className="rounded-lg flex-shrink-0"
                      style={{ width: 48, height: 72, objectFit: 'cover' }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate" style={{ color: 'var(--color-text-main)' }}>{selectedMovie.title}</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{selectedMovie.year}</p>
                  </div>
                  <button onClick={clearMovie} className="p-1 rounded-lg" style={{ color: 'var(--color-text-muted)' }}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  {/* TMDB search */}
                  {tmdbConfigured && (
                    <div className="relative mb-3">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
                      <input
                        type="text"
                        placeholder="Search movies on TMDB…"
                        value={tmdbQuery}
                        onChange={e => handleTmdbSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm"
                        style={{
                          background: 'var(--color-background)',
                          border: '1px solid var(--color-border)',
                          color: 'var(--color-text-main)',
                          outline: 'none',
                        }}
                      />
                      {searching && <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--color-text-muted)' }}>…</div>}
                    </div>
                  )}

                  {tmdbResults.length > 0 && (
                    <div className="rounded-xl overflow-hidden mb-3" style={{ border: '1px solid var(--color-border)' }}>
                      {tmdbResults.map(movie => (
                        <button key={movie.id} onClick={() => selectTmdbMovie(movie)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors"
                          style={{ background: 'var(--color-background)', borderBottom: '1px solid var(--color-border)' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'var(--color-background)'}
                        >
                          {movie.poster_url ? (
                            <img src={movie.poster_url} alt={movie.title} className="rounded flex-shrink-0" style={{ width: 32, height: 48, objectFit: 'cover' }} />
                          ) : (
                            <div className="flex-shrink-0 flex items-center justify-center rounded" style={{ width: 32, height: 48, background: '#374151' }}>
                              <Film className="w-4 h-4" style={{ color: '#9ca3af' }} />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-text-main)' }}>{movie.title}</p>
                            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{movie.year}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Manual entry */}
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                    {tmdbConfigured ? 'Or type manually:' : 'Movie / Show title:'}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Avengers: Endgame"
                    value={movieTitle}
                    onChange={e => setMovieTitle(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl text-sm"
                    style={{
                      background: 'var(--color-background)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text-main)',
                      outline: 'none',
                    }}
                  />
                  {!tmdbConfigured && (
                    <p className="text-xs mt-1.5" style={{ color: '#f59e0b' }}>
                      ⚠️ TMDB API not configured — add TMDB_API_KEY to your server .env to enable movie search
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Content type */}
            <div className="rounded-2xl p-5" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <h2 className="font-bold text-base mb-3" style={{ color: 'var(--color-text-main)' }}>📝 Content Type</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {CONTENT_TYPES.map(ct => (
                  <button key={ct.key} onClick={() => setContentType(ct.key)}
                    className="p-3 rounded-xl text-left transition-all"
                    style={{
                      border: `2px solid ${contentType === ct.key ? '#e11d48' : 'var(--color-border)'}`,
                      background: contentType === ct.key ? 'rgba(225,29,72,0.08)' : 'var(--color-background)',
                    }}
                  >
                    <div className="font-bold text-sm" style={{ color: 'var(--color-text-main)' }}>{ct.label}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{ct.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="rounded-2xl p-5" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <h2 className="font-bold text-base mb-1" style={{ color: 'var(--color-text-main)' }}>💬 Notes <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>(optional)</span></h2>
              <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>Your thoughts, talking points, or key facts you want to cover</p>
              <textarea
                rows={4}
                placeholder="e.g. My favourite part was the final battle scene…"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-sm resize-none"
                style={{
                  background: 'var(--color-background)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-main)',
                  outline: 'none',
                }}
              />
            </div>

            <button
              onClick={createProject}
              disabled={creating || !movieTitle.trim()}
              className="w-full py-3.5 rounded-2xl font-bold text-white text-base"
              style={{
                background: creating || !movieTitle.trim()
                  ? '#9ca3af'
                  : 'linear-gradient(135deg, #e11d48, #9333ea)',
              }}
            >
              {creating ? '⏳ Creating…' : '🎬 Create Project & Open Editor'}
            </button>
          </div>
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}
