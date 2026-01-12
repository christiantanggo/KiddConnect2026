'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001').replace(/\/$/, '');

export default function OrganizationSelectionModal({ organizations, onSelect, onClose }) {
  const router = useRouter();
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (organizations.length === 1) {
      // Auto-select if only one organization
      handleSelect(organizations[0].id);
    }
  }, [organizations]);

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

  const handleSelect = async (orgId) => {
    if (!orgId) {
      setError('Please select an organization');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const headers = getAuthHeaders();
      const res = await fetch(`${API_URL}/api/v2/organizations/select`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ business_id: orgId }),
      });

      if (res.ok) {
        const data = await res.json();
        if (typeof window !== 'undefined') {
          localStorage.setItem('activeBusinessId', orgId);
        }
        if (onSelect) {
          onSelect(data.organization);
        }
        // Reload page to refresh context
        window.location.href = '/dashboard/v2';
      } else {
        const errorData = await res.json();
        setError(errorData.error || 'Failed to select organization');
      }
    } catch (err) {
      console.error('[OrganizationSelectionModal] Error:', err);
      setError('Failed to select organization. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleSelect(selectedOrgId);
  };

  if (organizations.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
        <div 
          className="w-full max-w-md shadow-lg"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderRadius: 'var(--card-radius)',
            padding: 'var(--padding-base)',
          }}
        >
          <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--color-text-main)' }}>
            No Organizations
          </h2>
          <p className="mb-6" style={{ color: 'var(--color-text-muted)' }}>
            You are not a member of any organizations yet. Please contact support to be added to an organization.
          </p>
          <button
            onClick={() => router.push('/login')}
            className="w-full px-4 py-2 text-white font-medium transition-opacity"
            style={{
              backgroundColor: 'var(--color-accent)',
              borderRadius: 'var(--button-radius)',
              height: 'var(--input-height)',
            }}
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  if (organizations.length === 1) {
    // Auto-selecting, show loading state
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
        <div 
          className="w-full max-w-md shadow-lg text-center"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderRadius: 'var(--card-radius)',
            padding: 'var(--padding-base)',
          }}
        >
          <p style={{ color: 'var(--color-text-muted)' }}>Selecting organization...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
      <div 
        className="w-full max-w-md shadow-lg"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--card-radius)',
          padding: 'var(--padding-base)',
        }}
      >
        <h2 className="text-2xl font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>
          Select Organization
        </h2>
        <p className="mb-6 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          You are a member of multiple organizations. Please select which one to use.
        </p>

        {error && (
          <div 
            className="px-4 py-3 mb-4"
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

        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label className="block text-sm font-medium mb-3" style={{ color: 'var(--color-text-main)' }}>
              Choose an organization:
            </label>
            <div className="space-y-2">
              {organizations.map((org) => (
                <label
                  key={org.id}
                  className="flex items-center p-4 border cursor-pointer transition-colors"
                  style={{
                    borderColor: selectedOrgId === org.id ? 'var(--color-accent)' : 'var(--color-border)',
                    borderRadius: 'var(--card-radius)',
                    backgroundColor: selectedOrgId === org.id ? 'rgba(20, 184, 166, 0.05)' : 'transparent',
                  }}
                >
                  <input
                    type="radio"
                    name="organization"
                    value={org.id}
                    checked={selectedOrgId === org.id}
                    onChange={(e) => setSelectedOrgId(e.target.value)}
                    className="mr-3"
                    style={{ accentColor: 'var(--color-accent)' }}
                  />
                  <div className="flex-1">
                    <div className="font-medium" style={{ color: 'var(--color-text-main)' }}>
                      {org.name}
                    </div>
                    {org.role && (
                      <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                        Role: {org.role.charAt(0).toUpperCase() + org.role.slice(1)}
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading || !selectedOrgId}
              className="flex-1 px-4 py-2 text-white font-medium transition-opacity disabled:opacity-50"
              style={{
                backgroundColor: 'var(--color-accent)',
                borderRadius: 'var(--button-radius)',
                height: 'var(--input-height)',
              }}
            >
              {loading ? 'Selecting...' : 'Continue'}
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 font-medium transition-colors"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-main)',
                  borderRadius: 'var(--button-radius)',
                  height: 'var(--input-height)',
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}


