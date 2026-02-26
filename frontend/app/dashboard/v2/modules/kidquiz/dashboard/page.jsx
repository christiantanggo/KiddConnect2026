'use client'; // v2

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import Link from 'next/link';
import { Plus, Play, Upload, CheckCircle, Clock, XCircle, Eye } from 'lucide-react';

const TABS = [
  { label: '🎯 My Quizzes', href: '/dashboard/v2/modules/kidquiz/dashboard' },
  { label: '⚙️ Settings',   href: '/dashboard/v2/modules/kidquiz/settings' },
];

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001').replace(/\/$/, '');

const STATUS_CONFIG = {
  DRAFT:            { label: 'Draft',            color: '#6b7280', icon: Clock },
  PENDING_APPROVAL: { label: 'Needs Approval',   color: '#f59e0b', icon: Clock },
  APPROVED:         { label: 'Approved',          color: '#3b82f6', icon: CheckCircle },
  RENDERING:        { label: 'Rendering...',       color: '#8b5cf6', icon: Play },
  READY:            { label: 'Ready to Upload',   color: '#10b981', icon: Upload },
  UPLOADING:        { label: 'Uploading...',      color: '#6366f1', icon: Upload },
  PUBLISHED:        { label: 'Published! 🎉',     color: '#10b981', icon: CheckCircle },
  FAILED:           { label: 'Failed',            color: '#ef4444', icon: XCircle },
};

function getAuthHeaders() {
  if (typeof document === 'undefined') return {};
  const token = document.cookie.split(';').find(c => c.trim().startsWith('token='))?.split('=')[1];
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

function getBusinessId() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('activeBusinessId') || localStorage.getItem('businessId');
}

export default function KidQuizDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => { loadProjects(); }, []);

  async function loadProjects() {
    try {
      setLoading(true);
      const headers = { ...getAuthHeaders(), 'X-Active-Business-Id': getBusinessId() };
      const res = await fetch(`${API_URL}/api/v2/kidquiz/projects`, { headers });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteProject(id) {
    if (!confirm('Delete this quiz project? This cannot be undone.')) return;
    const headers = { ...getAuthHeaders(), 'X-Active-Business-Id': getBusinessId() };
    await fetch(`${API_URL}/api/v2/kidquiz/projects/${id}`, { method: 'DELETE', headers });
    setProjects(p => p.filter(x => x.id !== id));
  }

  function getNextStep(project) {
    switch (project.status) {
      case 'DRAFT': return { label: 'Build Quiz', href: `/dashboard/v2/modules/kidquiz/projects/${project.id}/editor` };
      case 'PENDING_APPROVAL': return { label: 'Review & Approve', href: `/dashboard/v2/modules/kidquiz/projects/${project.id}/review` };
      case 'APPROVED': return { label: 'Render Video', href: `/dashboard/v2/modules/kidquiz/projects/${project.id}/render` };
      case 'RENDERING': return { label: 'View Render', href: `/dashboard/v2/modules/kidquiz/projects/${project.id}/render` };
      case 'READY': return { label: 'Upload to YouTube', href: `/dashboard/v2/modules/kidquiz/projects/${project.id}/upload` };
      case 'FAILED': return { label: '🔄 Restart Render', href: `/dashboard/v2/modules/kidquiz/projects/${project.id}/render` };
      case 'PUBLISHED': return { label: 'View', href: `/dashboard/v2/modules/kidquiz/projects/${project.id}/upload` };
      default: return null;
    }
  }

  function getCardHref(project) {
    switch (project.status) {
      case 'DRAFT': return `/dashboard/v2/modules/kidquiz/projects/${project.id}/editor`;
      case 'PENDING_APPROVAL': return `/dashboard/v2/modules/kidquiz/projects/${project.id}/review`;
      case 'APPROVED':
      case 'RENDERING':
      case 'FAILED': return `/dashboard/v2/modules/kidquiz/projects/${project.id}/render`;
      case 'READY':
      case 'UPLOADING':
      case 'PUBLISHED': return `/dashboard/v2/modules/kidquiz/projects/${project.id}/upload`;
      default: return `/dashboard/v2/modules/kidquiz/projects/${project.id}/editor`;
    }
  }

  return (
    <AuthGuard>
      <V2AppShell>
        <div style={{ padding: '16px' }}>

          {/* Toolbar: tabs + New Quiz — always one row, never wraps */}
          <div className="flex items-center gap-2 mb-4" style={{ minWidth: 0 }}>
            {/* Tab pill group — shrinks on small screens */}
            <div className="flex gap-1 p-1 rounded-xl flex-shrink-0" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              {TABS.map(tab => {
                const active = pathname === tab.href;
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap"
                    style={{
                      background: active ? 'linear-gradient(135deg, #6366f1, #ec4899)' : 'transparent',
                      color: active ? '#fff' : 'var(--color-text-muted)',
                    }}
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </div>

            {/* Spacer pushes button to the right */}
            <div className="flex-1" />

            <Link
              href="/dashboard/v2/modules/kidquiz/projects/new"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-white text-sm whitespace-nowrap flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #6366f1, #ec4899)' }}
            >
              <Plus className="w-4 h-4" /> New Quiz
            </Link>
          </div>

          {error && (
            <div className="p-4 mb-4 rounded-lg text-sm" style={{ background: '#fee2e2', color: '#dc2626' }}>{error}</div>
          )}

          {loading && (
            <div className="text-center py-16" style={{ color: 'var(--color-text-muted)' }}>Loading projects...</div>
          )}

          {!loading && projects.length === 0 && (
            <div className="text-center py-16">
              <div className="text-6xl mb-4">🎯</div>
              <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text-main)' }}>No quizzes yet!</h3>
              <p className="mb-6" style={{ color: 'var(--color-text-muted)' }}>Create your first quiz — it only takes a minute.</p>
              <Link
                href="/dashboard/v2/modules/kidquiz/projects/new"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #6366f1, #ec4899)' }}
              >
                <Plus className="w-5 h-5" /> Create First Quiz
              </Link>
            </div>
          )}

          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {projects.map(project => {
              const cfg = STATUS_CONFIG[project.status] || STATUS_CONFIG.DRAFT;
              const StatusIcon = cfg.icon;
              const nextStep = getNextStep(project);
              const cardHref = getCardHref(project);
              return (
                <div
                  key={project.id}
                  onClick={() => router.push(cardHref)}
                  className="p-4 rounded-xl border cursor-pointer transition-all flex flex-col gap-3"
                  style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = cfg.color}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
                >
                  {/* Status + category badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="text-xs font-bold uppercase px-2 py-0.5 rounded-full"
                      style={{ background: `${cfg.color}22`, color: cfg.color }}
                    >
                      <StatusIcon className="w-3 h-3 inline mr-1" />
                      {cfg.label}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#f3f4f6', color: '#6b7280' }}>
                      {project.category}
                    </span>
                  </div>

                  {/* Title */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-base leading-tight" style={{ color: 'var(--color-text-main)', wordBreak: 'break-word' }}>
                      {project.topic}
                    </h3>
                    {project.generated_title && (
                      <p className="text-xs mt-1 truncate" style={{ color: 'var(--color-text-muted)' }}>
                        📺 {project.generated_title}
                      </p>
                    )}
                    <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                      {new Date(project.created_at).toLocaleDateString()}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    {nextStep && (
                      <Link
                        href={nextStep.href}
                        className="flex-1 text-center px-3 py-1.5 rounded-lg text-sm font-semibold text-white"
                        style={{ background: project.status === 'FAILED' ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
                      >
                        {nextStep.label}
                      </Link>
                    )}
                    <button
                      onClick={() => deleteProject(project.id)}
                      className="px-2 py-1.5 rounded-lg text-sm flex-shrink-0"
                      style={{ background: '#fee2e2', color: '#dc2626' }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      </V2AppShell>
    </AuthGuard>
  );
}
