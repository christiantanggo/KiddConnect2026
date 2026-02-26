'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import { Plus, Film, Clock, CheckCircle, XCircle, Upload, Play } from 'lucide-react';

const TABS = [
  { label: '🎬 My Projects', href: '/dashboard/v2/modules/movie-review/dashboard' },
  { label: '⚙️ Settings',    href: '/dashboard/v2/modules/movie-review/settings' },
];

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

const STATUS_INFO = {
  DRAFT:      { label: 'Draft',     color: '#6b7280', bg: '#f3f4f6', icon: Film },
  RENDERING:  { label: 'Rendering', color: '#d97706', bg: '#fef3c7', icon: Clock },
  READY:      { label: 'Ready',     color: '#059669', bg: '#d1fae5', icon: CheckCircle },
  UPLOADING:  { label: 'Uploading', color: '#2563eb', bg: '#dbeafe', icon: Upload },
  PUBLISHED:  { label: 'Published', color: '#7c3aed', bg: '#ede9fe', icon: Play },
  FAILED:     { label: 'Failed',    color: '#dc2626', bg: '#fee2e2', icon: XCircle },
};

const TYPE_LABELS = {
  review: '🎬 Review', facts: '🤓 Facts', theory: '🔍 Theory', ranking: '📊 Ranking', other: '🎥 Other',
};

export default function MovieReviewDashboard() {
  const pathname = usePathname();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => { loadProjects(); }, []);

  async function loadProjects() {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v2/movie-review/projects`, { headers: apiHeaders() });
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteProject(project) {
    if (!confirm(`Delete "${project.movie_title}"? This cannot be undone.`)) return;
    setDeleting(project.id);
    try {
      await fetch(`${API_URL}/api/v2/movie-review/projects/${project.id}`, {
        method: 'DELETE', headers: apiHeaders(),
      });
      setProjects(p => p.filter(x => x.id !== project.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(null);
    }
  }

  function getEditorLink(project) {
    if (project.status === 'READY') return `/dashboard/v2/modules/movie-review/projects/${project.id}/render`;
    if (project.status === 'PUBLISHED') return `/dashboard/v2/modules/movie-review/projects/${project.id}/upload`;
    return `/dashboard/v2/modules/movie-review/projects/${project.id}/editor`;
  }

  return (
    <AuthGuard>
      <V2AppShell>
        <div style={{ padding: '16px', maxWidth: '100%' }}>
          {/* Toolbar */}
          <div className="flex items-center gap-2 mb-4" style={{ minWidth: 0 }}>
            <div className="flex gap-1 p-1 rounded-xl flex-shrink-0" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              {TABS.map(tab => {
                const active = pathname === tab.href;
                return (
                  <Link key={tab.href} href={tab.href}
                    className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap"
                    style={{
                      background: active ? 'linear-gradient(135deg, #e11d48, #9333ea)' : 'transparent',
                      color: active ? '#fff' : 'var(--color-text-muted)',
                    }}
                  >{tab.label}</Link>
                );
              })}
            </div>
            <div className="flex-1" />
            <Link href="/dashboard/v2/modules/movie-review/new"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-white text-sm whitespace-nowrap flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #e11d48, #9333ea)' }}
            >
              <Plus className="w-4 h-4" /> New Project
            </Link>
          </div>

          {error && <div className="p-3 mb-4 rounded-lg text-sm" style={{ background: '#fee2e2', color: '#dc2626' }}>{error}</div>}

          {loading ? (
            <div className="text-center py-20" style={{ color: 'var(--color-text-muted)' }}>Loading projects…</div>
          ) : projects.length === 0 ? (
            <div className="text-center py-20">
              <div className="text-6xl mb-4">🎬</div>
              <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text-main)' }}>No projects yet</h2>
              <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>Create your first movie review Short!</p>
              <Link href="/dashboard/v2/modules/movie-review/new"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #e11d48, #9333ea)' }}
              >
                <Plus className="w-4 h-4" /> New Project
              </Link>
            </div>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))' }}>
              {projects.map(project => {
                const statusInfo = STATUS_INFO[project.status] || STATUS_INFO.DRAFT;
                const StatusIcon = statusInfo.icon;
                const editorLink = getEditorLink(project);
                return (
                  <div key={project.id} className="rounded-2xl overflow-hidden"
                    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                    {/* Poster or placeholder */}
                    <div className="relative" style={{ height: 140, background: '#1e1b2e', overflow: 'hidden' }}>
                      {project.tmdb_poster_url ? (
                        <img src={project.tmdb_poster_url} alt={project.movie_title}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8 }} />
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <Film className="w-12 h-12" style={{ color: '#4c1d95', opacity: 0.4 }} />
                        </div>
                      )}
                      {/* Status badge */}
                      <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold"
                        style={{ background: statusInfo.bg, color: statusInfo.color }}>
                        <StatusIcon className="w-3 h-3" />
                        {statusInfo.label}
                      </div>
                      {/* Content type */}
                      <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full text-xs font-semibold"
                        style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}>
                        {TYPE_LABELS[project.content_type] || '🎥'}
                      </div>
                    </div>

                    <div className="p-4">
                      <h3 className="font-bold text-sm mb-1 truncate" style={{ color: 'var(--color-text-main)' }}>
                        {project.movie_title}
                      </h3>
                      <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
                        {project.yt_title || (project.notes_text ? project.notes_text.slice(0, 60) + '…' : 'No description yet')}
                      </p>
                      <div className="flex gap-2">
                        <Link href={editorLink} className="flex-1 text-center py-2 rounded-lg text-sm font-semibold text-white"
                          style={{ background: 'linear-gradient(135deg, #e11d48, #9333ea)' }}>
                          {project.status === 'READY' ? '🎬 Review & Upload' : project.status === 'PUBLISHED' ? '📺 View' : '✏️ Open Editor'}
                        </Link>
                        <button onClick={() => deleteProject(project)} disabled={deleting === project.id}
                          className="px-3 py-2 rounded-lg text-sm"
                          style={{ background: '#fee2e2', color: '#dc2626' }}>
                          {deleting === project.id ? '…' : '🗑️'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}
