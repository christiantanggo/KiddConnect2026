'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2DashboardHeader from '@/components/V2DashboardHeader';
import V2Sidebar from '@/components/V2Sidebar';
import { ArrowLeft, ArrowRight, CheckCircle2, Lock } from 'lucide-react';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001').replace(/\/$/, '');

export default function ModulesMarketplacePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [modules, setModules] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadModules();
  }, []);

  const getAuthHeaders = () => {
    if (typeof document === 'undefined') return {};
    const cookies = document.cookie.split(';');
    const tokenCookie = cookies.find(c => c.trim().startsWith('token='));
    const token = tokenCookie ? tokenCookie.split('=')[1] : null;
    
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  };

  const loadModules = async () => {
    try {
      setError(null);
      const headers = getAuthHeaders();
      
      const res = await fetch(`${API_URL}/api/v2/modules`, { headers });
      
      if (res.ok) {
        const data = await res.json();
        setModules(data.modules || []);
      } else if (res.status === 429) {
        const errorData = await res.json().catch(() => ({ error: 'Too many requests' }));
        setError(errorData.error || 'Too many requests. Please wait a moment and refresh.');
      } else {
        const errorData = await res.json().catch(() => ({ error: 'Failed to load modules' }));
        setError(errorData.error || 'Failed to load modules');
      }
    } catch (err) {
      console.error('[Modules Marketplace] Error:', err);
      if (err.message?.includes('JSON') || err.message?.includes('429')) {
        setError('Rate limit exceeded. Please wait a moment and refresh the page.');
      } else {
        setError('Failed to load modules. Please refresh the page.');
      }
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (module) => {
    if (module.subscribed) {
      return (
        <span 
          className="px-2 py-1 text-xs font-medium flex items-center gap-1"
          style={{
            backgroundColor: 'rgba(20, 184, 166, 0.1)',
            color: 'var(--color-accent)',
            borderRadius: 'var(--button-radius)',
          }}
        >
          <CheckCircle2 className="w-3 h-3" /> Active
        </span>
      );
    }
    return (
      <span 
        className="px-2 py-1 text-xs font-medium flex items-center gap-1"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.05)',
          color: 'var(--color-text-muted)',
          borderRadius: 'var(--button-radius)',
        }}
      >
        <Lock className="w-3 h-3" /> Available
      </span>
    );
  };

  const getHealthBadge = (status) => {
    if (status === 'healthy') {
      return (
        <span 
          className="px-2 py-1 text-xs font-medium flex items-center gap-1"
          style={{
            backgroundColor: 'rgba(20, 184, 166, 0.1)',
            color: 'var(--color-accent)',
            borderRadius: 'var(--button-radius)',
          }}
        >
          <span>●</span> Healthy
        </span>
      );
    }
    if (status === 'degraded') {
      return (
        <span 
          className="px-2 py-1 text-xs font-medium flex items-center gap-1"
          style={{
            backgroundColor: 'rgba(250, 204, 21, 0.1)',
            color: 'var(--color-accent-2)',
            borderRadius: 'var(--button-radius)',
          }}
        >
          <span>⚠</span> Degraded
        </span>
      );
    }
    if (status === 'offline') {
      return (
        <span 
          className="px-2 py-1 text-xs font-medium flex items-center gap-1"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            color: 'var(--color-danger)',
            borderRadius: 'var(--button-radius)',
          }}
        >
          <span>●</span> Offline
        </span>
      );
    }
    return null;
  };

  // Get app logo path for module
  const getModuleLogo = (moduleKey) => {
    const logoMap = {
      'phone-agent': '/App-Logos/Tavari-Phone-Agent.png',
      'reviews': '/App-Logos/Tavari-Review-Reply-AI.png',
      // Add more modules as logo files are added
    };
    return logoMap[moduleKey] || null;
  };

  // Separate modules into active and available (same logic as sidebar)
  const activeModules = modules.filter(module => module.subscribed && module.health_status !== 'offline');
  const availableModules = modules.filter(module => !module.subscribed);

  // Module card component
  const ModuleCard = ({ module }) => {
    const logoPath = getModuleLogo(module.key);
    return (
      <div
        key={module.key}
        className="shadow transition-shadow overflow-hidden flex flex-col"
        style={{
          backgroundColor: 'var(--color-background)',
          borderRadius: 'var(--card-radius)',
        }}
        onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 10px 15px rgba(0,0,0,0.1)'}
        onMouseLeave={(e) => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'}
      >
        {/* App Logo Tile at Top */}
        {logoPath && (
          <div className="w-full h-48 flex items-center justify-center" style={{ backgroundColor: 'var(--color-background)' }}>
            <img
              src={logoPath}
              alt={module.name}
              className="w-full h-full object-contain"
              style={{ padding: '1rem' }}
            />
          </div>
        )}
        
        {/* Card Content */}
        <div className="flex flex-col flex-1" style={{ padding: 'var(--padding-base)' }}>
          {/* Module Title */}
          <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>
            {module.name}
          </h3>
          
          {/* Status Badge */}
          <div className="mb-3">
            {getStatusBadge(module)}
          </div>

          {/* Description */}
          {module.description && (
            <p className="text-sm mb-4 flex-1" style={{ color: 'var(--color-text-muted)' }}>
              {module.description}
            </p>
          )}

          {/* Action Button */}
          <div className="mt-auto">
            <Link
              href={module.subscribed 
                ? (module.key === 'phone-agent' ? '/tavari-ai-phone/dashboard' : module.key === 'reviews' ? '/review-reply-ai/dashboard' : `/dashboard/v2/modules/${module.key}/dashboard`)
                : `/dashboard/v2/modules/${module.key}`
              }
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition-colors rounded w-full"
              style={{ 
                backgroundColor: 'var(--color-accent)',
                color: 'white',
                borderRadius: 'var(--button-radius)',
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
            >
              {module.subscribed ? (
                <>Open Dashboard <ArrowRight className="w-4 h-4" /></>
              ) : (
                <>Learn More <ArrowRight className="w-4 h-4" /></>
              )}
            </Link>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <AuthGuard>
        <div className="min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
          <V2DashboardHeader />
          <V2Sidebar />
          <div className="sidebar-offset flex items-center justify-center min-h-[60vh]" style={{ paddingTop: 'var(--topbar-height)' }}>
            <div className="text-lg" style={{ color: 'var(--color-text-muted)' }}>Loading modules...</div>
          </div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
        <V2DashboardHeader />
        <V2Sidebar />
        
        <div className="sidebar-offset" style={{ paddingTop: 'var(--topbar-height)' }}>
          <div className="mx-auto py-8" style={{ maxWidth: 'var(--max-content-width)', padding: 'var(--padding-base)' }}>
            {/* Header */}
            <div className="mb-8">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>Module Marketplace</h1>
                  <p style={{ color: 'var(--color-text-muted)' }}>
                    Browse and activate AI modules for your organization
                  </p>
                </div>
              </div>
            </div>

            {error && (
              <div 
                className="px-4 py-3 mb-6"
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  color: 'var(--color-danger)',
                  borderRadius: 'var(--card-radius)',
                }}
              >
                {error}
              </div>
            )}

            {/* Active Modules Section */}
            {activeModules.length > 0 && (
              <div className="mb-12">
                <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--color-text-main)' }}>
                  Active Modules ({activeModules.length})
                </h2>
                <div 
                  className="shadow p-6"
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    borderRadius: 'var(--card-radius)',
                  }}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {activeModules.map((module) => (
                      <ModuleCard key={module.key} module={module} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Available Modules Section */}
            {availableModules.length > 0 && (
              <div>
                <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--color-text-main)' }}>
                  Available Modules ({availableModules.length})
                </h2>
                <div 
                  className="shadow p-6"
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    borderRadius: 'var(--card-radius)',
                  }}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {availableModules.map((module) => (
                      <ModuleCard key={module.key} module={module} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Empty State */}
            {activeModules.length === 0 && availableModules.length === 0 && (
              <div 
                className="shadow p-12 text-center"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  borderRadius: 'var(--card-radius)',
                }}
              >
                <p style={{ color: 'var(--color-text-muted)' }}>No modules available.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
