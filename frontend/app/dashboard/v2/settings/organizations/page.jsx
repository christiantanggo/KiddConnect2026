'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import { ArrowLeft } from 'lucide-react';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001').replace(/\/$/, '');

export default function OrganizationsSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [organizations, setOrganizations] = useState([]);
  const [currentOrg, setCurrentOrg] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joining, setJoining] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedOrgToJoin, setSelectedOrgToJoin] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    timezone: 'America/New_York',
  });

  useEffect(() => {
    loadOrganizations();
  }, []);

  const getAuthHeaders = () => {
    if (typeof document === 'undefined') return {};
    const cookies = document.cookie.split(';');
    const tokenCookie = cookies.find(c => c.trim().startsWith('token='));
    const token = tokenCookie ? tokenCookie.split('=')[1] : null;
    
    const businessId = typeof window !== 'undefined' 
      ? localStorage.getItem('activeBusinessId') || localStorage.getItem('businessId')
      : null;
    
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    
    if (businessId) {
      headers['X-Active-Business-Id'] = businessId;
    }
    
    return headers;
  };

  const loadOrganizations = async () => {
    try {
      setError(null);
      const headers = getAuthHeaders();
      
      // Load all organizations
      const orgsRes = await fetch(`${API_URL}/api/v2/organizations`, { headers });
      if (orgsRes.ok) {
        const orgsData = await orgsRes.json();
        setOrganizations(orgsData.organizations || []);
      }

      // Load current organization
      const currentRes = await fetch(`${API_URL}/api/v2/organizations/current`, { headers });
      if (currentRes.ok) {
        const currentData = await currentRes.json();
        if (currentData.organization) {
          setCurrentOrg(currentData.organization);
        }
      }
    } catch (err) {
      console.error('[Organizations Settings] Error:', err);
      setError('Failed to load organizations');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      const headers = getAuthHeaders();
      const res = await fetch(`${API_URL}/api/v2/organizations`, {
        method: 'POST',
        headers,
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        const data = await res.json();
        setSuccess('Organization created successfully!');
        setShowCreateModal(false);
        setFormData({
          name: '',
          email: '',
          phone: '',
          address: '',
          timezone: 'America/New_York',
        });
        
        // Reload organizations and auto-select the new one
        await loadOrganizations();
        
        // Auto-select the newly created organization
        if (data.organization) {
          await selectOrganization(data.organization.id);
        }
        
        setTimeout(() => setSuccess(null), 3000);
      } else {
        const errorData = await res.json();
        setError(errorData.error || 'Failed to create organization');
      }
    } catch (err) {
      console.error('[Organizations Settings] Error:', err);
      setError('Failed to create organization');
    } finally {
      setCreating(false);
    }
  };

  const selectOrganization = async (businessId) => {
    try {
      const headers = getAuthHeaders();
      const res = await fetch(`${API_URL}/api/v2/organizations/select`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ business_id: businessId }),
      });

      if (res.ok) {
        const data = await res.json();
        setCurrentOrg(data.organization);
        if (typeof window !== 'undefined') {
          localStorage.setItem('activeBusinessId', businessId);
        }
        // Reload to refresh context
        window.location.href = '/dashboard/v2';
      }
    } catch (err) {
      console.error('[Organizations Settings] Error selecting organization:', err);
      setError('Failed to select organization');
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const timezones = [
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Phoenix',
    'America/Anchorage',
    'Pacific/Honolulu',
  ];

  if (loading) {
    return (
      <AuthGuard>
        <V2AppShell>
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-lg" style={{ color: 'var(--color-text-muted)' }}>Loading...</div>
          </div>
        </V2AppShell>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <V2AppShell>
        <div className="mx-auto py-8" style={{ maxWidth: 'var(--max-content-width)', padding: 'var(--padding-base)' }}>
          {/* Header */}
          <div className="mb-8">
            <Link
              href="/dashboard/v2/settings"
              className="text-sm mb-4 inline-block transition-colors"
              style={{ color: 'var(--color-text-muted)' }}
              onMouseEnter={(e) => e.target.style.color = 'var(--color-text-main)'}
              onMouseLeave={(e) => e.target.style.color = 'var(--color-text-muted)'}
            >
              <ArrowLeft className="w-4 h-4 inline mr-1" /> Back to Settings
            </Link>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>Organizations</h1>
                <p style={{ color: 'var(--color-text-muted)' }}>
                  Manage your organizations and memberships
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowJoinModal(true)}
                  className="px-6 py-3 font-medium transition-colors"
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-main)',
                    borderRadius: 'var(--button-radius)',
                    height: 'var(--input-height)',
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = 'var(--color-accent)';
                    e.target.style.color = 'white';
                    e.target.style.borderColor = 'var(--color-accent)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = 'var(--color-surface)';
                    e.target.style.color = 'var(--color-text-main)';
                    e.target.style.borderColor = 'var(--color-border)';
                  }}
                >
                  Join Organization
                </button>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-6 py-3 text-white font-medium transition-opacity"
                  style={{
                    backgroundColor: 'var(--color-accent)',
                    borderRadius: 'var(--button-radius)',
                    height: 'var(--input-height)',
                  }}
                  onMouseEnter={(e) => e.target.style.opacity = '0.9'}
                  onMouseLeave={(e) => e.target.style.opacity = '1'}
                >
                  + Create Organization
                </button>
              </div>
            </div>
          </div>

          {/* Messages */}
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

          {success && (
            <div 
              className="px-4 py-3 mb-6"
              style={{
                backgroundColor: 'rgba(20, 184, 166, 0.1)',
                border: '1px solid rgba(20, 184, 166, 0.2)',
                color: 'var(--color-accent)',
                borderRadius: 'var(--card-radius)',
              }}
            >
              {success}
            </div>
          )}

          {/* Organizations List */}
          <div 
            className="shadow mb-6"
            style={{
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--card-radius)',
              padding: 'var(--padding-base)',
            }}
          >
            {organizations.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-lg mb-4" style={{ color: 'var(--color-text-muted)' }}>
                  You don't belong to any organizations yet
                </p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-6 py-3 text-white font-medium transition-opacity"
                  style={{
                    backgroundColor: 'var(--color-accent)',
                    borderRadius: 'var(--button-radius)',
                  }}
                >
                  Create Your First Organization
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {organizations.map((org) => (
                  <div
                    key={org.id}
                    className={`p-4 border rounded transition-colors ${
                      currentOrg?.id === org.id ? 'border-accent' : ''
                    }`}
                    style={{
                      borderColor: currentOrg?.id === org.id 
                        ? 'var(--color-accent)' 
                        : 'var(--color-border)',
                      backgroundColor: currentOrg?.id === org.id 
                        ? 'rgba(20, 184, 166, 0.05)' 
                        : 'transparent',
                      borderRadius: 'var(--card-radius)',
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold" style={{ color: 'var(--color-text-main)' }}>
                            {org.name}
                          </h3>
                          {currentOrg?.id === org.id && (
                            <span 
                              className="px-2 py-1 text-xs font-medium rounded"
                              style={{
                                backgroundColor: 'var(--color-accent)',
                                color: 'white',
                                borderRadius: 'var(--button-radius)',
                              }}
                            >
                              Active
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                          <span>Role: <strong className="capitalize">{org.role}</strong></span>
                          <span>•</span>
                          <span>Joined: {new Date(org.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      {currentOrg?.id !== org.id && (
                        <button
                          onClick={() => selectOrganization(org.id)}
                          className="px-4 py-2 text-sm font-medium transition-colors"
                          style={{
                            backgroundColor: 'var(--color-surface)',
                            border: '1px solid var(--color-border)',
                            color: 'var(--color-text-main)',
                            borderRadius: 'var(--button-radius)',
                          }}
                          onMouseEnter={(e) => {
                            e.target.style.backgroundColor = 'var(--color-accent)';
                            e.target.style.color = 'white';
                            e.target.style.borderColor = 'var(--color-accent)';
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.backgroundColor = 'var(--color-surface)';
                            e.target.style.color = 'var(--color-text-main)';
                            e.target.style.borderColor = 'var(--color-border)';
                          }}
                        >
                          Switch To
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Create Organization Modal */}
        {showCreateModal && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowCreateModal(false);
              }
            }}
          >
            <div 
              className="w-full max-w-md shadow-lg"
              style={{
                backgroundColor: 'var(--color-surface)',
                borderRadius: 'var(--card-radius)',
                padding: 'var(--padding-base)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--color-text-main)' }}>
                Create New Organization
              </h2>
              
              <form onSubmit={handleCreate}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                      Organization Name *
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      className="w-full px-4 py-2 border rounded transition-colors focus:outline-none focus:ring-2"
                      style={{
                        backgroundColor: 'var(--color-surface)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text-main)',
                        borderRadius: 'var(--button-radius)',
                        height: 'var(--input-height)',
                      }}
                      onFocus={(e) => e.target.style.borderColor = 'var(--color-accent)'}
                      onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                      placeholder="My Company"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                      Email
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border rounded transition-colors focus:outline-none focus:ring-2"
                      style={{
                        backgroundColor: 'var(--color-surface)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text-main)',
                        borderRadius: 'var(--button-radius)',
                        height: 'var(--input-height)',
                      }}
                      onFocus={(e) => e.target.style.borderColor = 'var(--color-accent)'}
                      onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                      placeholder="contact@example.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                      Phone (Optional)
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border rounded transition-colors focus:outline-none focus:ring-2"
                      style={{
                        backgroundColor: 'var(--color-surface)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text-main)',
                        borderRadius: 'var(--button-radius)',
                        height: 'var(--input-height)',
                      }}
                      onFocus={(e) => e.target.style.borderColor = 'var(--color-accent)'}
                      onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                      placeholder="+1 (555) 123-4567"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                      Timezone *
                    </label>
                    <select
                      name="timezone"
                      value={formData.timezone}
                      onChange={handleChange}
                      required
                      className="w-full px-4 py-2 border rounded transition-colors focus:outline-none focus:ring-2"
                      style={{
                        backgroundColor: 'var(--color-surface)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text-main)',
                        borderRadius: 'var(--button-radius)',
                        height: 'var(--input-height)',
                      }}
                      onFocus={(e) => e.target.style.borderColor = 'var(--color-accent)'}
                      onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                    >
                      {timezones.map(tz => (
                        <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                      Address (Optional)
                    </label>
                    <textarea
                      name="address"
                      value={formData.address}
                      onChange={handleChange}
                      rows={3}
                      className="w-full px-4 py-2 border rounded transition-colors focus:outline-none focus:ring-2 resize-none"
                      style={{
                        backgroundColor: 'var(--color-surface)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text-main)',
                        borderRadius: 'var(--button-radius)',
                      }}
                      onFocus={(e) => e.target.style.borderColor = 'var(--color-accent)'}
                      onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                      placeholder="123 Main St, City, State, ZIP"
                    />
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    type="submit"
                    disabled={creating}
                    className="flex-1 px-6 py-3 text-white font-medium transition-opacity disabled:opacity-50"
                    style={{
                      backgroundColor: 'var(--color-accent)',
                      borderRadius: 'var(--button-radius)',
                      height: 'var(--input-height)',
                    }}
                  >
                    {creating ? 'Creating...' : 'Create Organization'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      setError(null);
                      setFormData({
                        name: '',
                        email: '',
                        phone: '',
                        address: '',
                        timezone: 'America/New_York',
                      });
                    }}
                    className="px-6 py-3 font-medium transition-colors"
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
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Join Organization Modal */}
        {showJoinModal && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowJoinModal(false);
                setSearchQuery('');
                setSearchResults([]);
                setSelectedOrgToJoin(null);
              }
            }}
          >
            <div 
              className="w-full max-w-md shadow-lg"
              style={{
                backgroundColor: 'var(--color-surface)',
                borderRadius: 'var(--card-radius)',
                padding: 'var(--padding-base)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--color-text-main)' }}>
                Join Existing Organization
              </h2>
              
              {!selectedOrgToJoin ? (
                <>
                  <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
                    Search for an organization by name or email to join it.
                  </p>
                  
                  <div className="mb-4">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={async (e) => {
                        const query = e.target.value;
                        setSearchQuery(query);
                        
                        if (query.length >= 2) {
                          setSearching(true);
                          try {
                            const headers = getAuthHeaders();
                            const res = await fetch(`${API_URL}/api/v2/organizations/search?q=${encodeURIComponent(query)}`, {
                              headers
                            });
                            
                            if (res.ok) {
                              const data = await res.json();
                              setSearchResults(data.organizations || []);
                            } else {
                              setSearchResults([]);
                            }
                          } catch (err) {
                            console.error('[Organizations] Search error:', err);
                            setSearchResults([]);
                          } finally {
                            setSearching(false);
                          }
                        } else {
                          setSearchResults([]);
                        }
                      }}
                      placeholder="Search by organization name or email..."
                      className="w-full px-4 py-2 border rounded transition-colors focus:outline-none focus:ring-2"
                      style={{
                        backgroundColor: 'var(--color-surface)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text-main)',
                        borderRadius: 'var(--button-radius)',
                        height: 'var(--input-height)',
                      }}
                      onFocus={(e) => e.target.style.borderColor = 'var(--color-accent)'}
                      onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                    />
                  </div>
                  
                  {searching && (
                    <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>Searching...</p>
                  )}
                  
                  {searchResults.length > 0 && (
                    <div className="mb-4 max-h-64 overflow-y-auto">
                      {searchResults.map((org) => (
                        <div
                          key={org.id}
                          onClick={() => setSelectedOrgToJoin(org)}
                          className="p-3 border rounded mb-2 cursor-pointer transition-colors"
                          style={{
                            borderColor: 'var(--color-border)',
                            borderRadius: 'var(--card-radius)',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(20, 184, 166, 0.05)';
                            e.currentTarget.style.borderColor = 'var(--color-accent)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                            e.currentTarget.style.borderColor = 'var(--color-border)';
                          }}
                        >
                          <div className="font-medium" style={{ color: 'var(--color-text-main)' }}>
                            {org.name}
                          </div>
                          {org.email && (
                            <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                              {org.email}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
                    <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
                      No organizations found. Try a different search term.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="mb-6">
                    <p className="text-sm mb-2" style={{ color: 'var(--color-text-muted)' }}>Organization:</p>
                    <p className="font-medium text-lg" style={{ color: 'var(--color-text-main)' }}>
                      {selectedOrgToJoin.name}
                    </p>
                    {selectedOrgToJoin.email && (
                      <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                        {selectedOrgToJoin.email}
                      </p>
                    )}
                  </div>
                  
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
                  
                  <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
                    Click "Join" to add this organization to your account. You'll be able to switch between organizations.
                  </p>
                  
                  <div className="flex gap-3">
                    <button
                      onClick={async () => {
                        setJoining(true);
                        setError(null);
                        
                        try {
                          const headers = getAuthHeaders();
                          const res = await fetch(`${API_URL}/api/v2/organizations/join`, {
                            method: 'POST',
                            headers,
                            body: JSON.stringify({ 
                              business_id: selectedOrgToJoin.id,
                              role: 'staff' // Default role when joining
                            }),
                          });
                          
                          if (res.ok) {
                            const data = await res.json();
                            setSuccess(data.message || 'Successfully joined organization');
                            setShowJoinModal(false);
                            setSearchQuery('');
                            setSearchResults([]);
                            setSelectedOrgToJoin(null);
                            
                            // Reload organizations
                            await loadOrganizations();
                            
                            setTimeout(() => setSuccess(null), 3000);
                          } else {
                            const errorData = await res.json();
                            setError(errorData.message || errorData.error || 'Failed to join organization');
                          }
                        } catch (err) {
                          console.error('[Organizations] Join error:', err);
                          setError('Failed to join organization');
                        } finally {
                          setJoining(false);
                        }
                      }}
                      disabled={joining}
                      className="flex-1 px-6 py-3 text-white font-medium transition-opacity disabled:opacity-50"
                      style={{
                        backgroundColor: 'var(--color-accent)',
                        borderRadius: 'var(--button-radius)',
                        height: 'var(--input-height)',
                      }}
                    >
                      {joining ? 'Requesting...' : 'Request to Join'}
                    </button>
                    <button
                      onClick={() => {
                        setSelectedOrgToJoin(null);
                        setSearchQuery('');
                        setSearchResults([]);
                        setError(null);
                      }}
                      className="px-6 py-3 font-medium transition-colors"
                      style={{
                        backgroundColor: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-main)',
                        borderRadius: 'var(--button-radius)',
                        height: 'var(--input-height)',
                      }}
                    >
                      Back
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </V2AppShell>
    </AuthGuard>
  );
}

