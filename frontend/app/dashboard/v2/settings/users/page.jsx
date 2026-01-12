'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import { ArrowLeft } from 'lucide-react';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001').replace(/\/$/, '');

export default function UsersSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviting, setInviting] = useState(false);

  const [inviteForm, setInviteForm] = useState({
    email: '',
    role: 'staff',
  });
  const [managingUser, setManagingUser] = useState(null);
  const [showManageModal, setShowManageModal] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState(null);
  const [joinRequests, setJoinRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [permissions, setPermissions] = useState([]);
  const [rolePermissions, setRolePermissions] = useState({});
  const [loadingPermissions, setLoadingPermissions] = useState(false);
  const [savingPermission, setSavingPermission] = useState(false);
  const [permissionChanges, setPermissionChanges] = useState({}); // Track pending changes

  useEffect(() => {
    loadUsers();
    loadJoinRequests();
    loadPermissions();
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

  const loadJoinRequests = async () => {
    // Only load if user is owner/admin
    try {
      setLoadingRequests(true);
      const headers = getAuthHeaders();
      const res = await fetch(`${API_URL}/api/v2/organizations/join-requests`, {
        headers
      });
      
      if (res.ok) {
        const data = await res.json();
        setJoinRequests(data.requests || []);
      } else if (res.status === 403) {
        // User doesn't have permission, that's fine
        setJoinRequests([]);
      } else if (res.status === 400 || res.status === 500) {
        // Organization context issue or server error - silently ignore for now
        // This can happen for legacy users without organization_users entries
        setJoinRequests([]);
      }
    } catch (err) {
      // Silently handle errors - join requests are optional
      console.warn('[Users Settings] Could not load join requests:', err.message);
      setJoinRequests([]);
    } finally {
      setLoadingRequests(false);
    }
  };

  const loadPermissions = async () => {
    try {
      setLoadingPermissions(true);
      const headers = getAuthHeaders();
      const res = await fetch(`${API_URL}/api/v2/settings/permissions`, {
        headers
      });
      
      if (res.ok) {
        const data = await res.json();
        setPermissions(data.permissions || []);
        setRolePermissions(data.role_permissions || {});
        
        setPermissionChanges({});
      } else if (res.status === 403) {
        // User doesn't have permission to view permissions
        setPermissions([]);
        setRolePermissions({});
        setPermissionChanges({});
      }
    } catch (err) {
      console.warn('[Users Settings] Could not load permissions:', err.message);
      setPermissions([]);
      setRolePermissions({});
      setPermissionChanges({});
    } finally {
      setLoadingPermissions(false);
    }
  };

  const handlePermissionChange = async (role, permissionKey, enabled) => {
    try {
      setSavingPermission(true);
      const headers = getAuthHeaders();
      
      const res = await fetch(`${API_URL}/api/v2/settings/permissions`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          role,
          permission_key: permissionKey,
          enabled,
        }),
      });
      
      if (res.ok) {
        const data = await res.json();
        
        // Update local state
        setRolePermissions(prev => {
          const newRolePerms = { ...prev };
          if (enabled) {
            if (!newRolePerms[role]) {
              newRolePerms[role] = [];
            }
            if (!newRolePerms[role].includes(permissionKey)) {
              newRolePerms[role] = [...newRolePerms[role], permissionKey];
            }
          } else {
            if (newRolePerms[role]) {
              newRolePerms[role] = newRolePerms[role].filter(key => key !== permissionKey);
            }
          }
          return newRolePerms;
        });
        
        setSuccess(`Permission ${enabled ? 'added to' : 'removed from'} ${role} role`);
        setTimeout(() => setSuccess(null), 3000);
      } else {
        const errorData = await res.json();
        setError(errorData.error || 'Failed to update permission');
        setTimeout(() => setError(null), 5000);
      }
    } catch (err) {
      console.error('[Users Settings] Error updating permission:', err);
      setError('Failed to update permission');
      setTimeout(() => setError(null), 5000);
    } finally {
      setSavingPermission(false);
    }
  };

  const handleApproveRequest = async (requestId, requestedRole) => {
    try {
      const headers = getAuthHeaders();
      const res = await fetch(`${API_URL}/api/v2/organizations/join-requests/${requestId}/approve`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ role: requestedRole }),
      });
      
      if (res.ok) {
        const data = await res.json();
        setSuccess(data.message || 'Join request approved');
        await loadUsers();
        await loadJoinRequests();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        const errorData = await res.json();
        setError(errorData.error || 'Failed to approve request');
      }
    } catch (err) {
      console.error('[Users Settings] Error approving request:', err);
      setError('Failed to approve request');
    }
  };

  const handleRejectRequest = async (requestId) => {
    if (!confirm('Are you sure you want to reject this join request?')) {
      return;
    }
    
    try {
      const headers = getAuthHeaders();
      const res = await fetch(`${API_URL}/api/v2/organizations/join-requests/${requestId}/reject`, {
        method: 'POST',
        headers,
      });
      
      if (res.ok) {
        setSuccess('Join request rejected');
        await loadJoinRequests();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        const errorData = await res.json();
        setError(errorData.error || 'Failed to reject request');
      }
    } catch (err) {
      console.error('[Users Settings] Error rejecting request:', err);
      setError('Failed to reject request');
    }
  };

  const loadUsers = async () => {
    try {
      setError(null);
      const res = await fetch(`${API_URL}/api/v2/settings/users`, {
        headers: getAuthHeaders()
      });

      if (res.ok) {
        const data = await res.json();
        const usersList = data.users || [];
        setUsers(usersList);
        
        // Get current user's role in this organization
        // First try to get from current organization endpoint
        let foundRole = null;
        try {
          const currentOrgRes = await fetch(`${API_URL}/api/v2/organizations/current`, {
            headers: getAuthHeaders()
          });
          if (currentOrgRes.ok) {
            const currentOrgData = await currentOrgRes.json();
            if (currentOrgData.organization?.role) {
              foundRole = currentOrgData.organization.role;
            }
          }
        } catch (err) {
          console.warn('Could not get current user role from API:', err);
        }
        
        // Fallback: find current user in the users list
        if (!foundRole) {
          const cookies = document.cookie.split(';');
          const tokenCookie = cookies.find(c => c.trim().startsWith('token='));
          if (tokenCookie) {
            try {
              const token = tokenCookie.split('=')[1];
              const payload = JSON.parse(atob(token.split('.')[1]));
              const currentUserId = payload.userId;
              const currentUser = usersList.find(u => u.id === currentUserId);
              if (currentUser) {
                foundRole = currentUser.role;
              }
            } catch (err) {
              console.warn('Could not parse token:', err);
            }
          }
        }
        
        if (foundRole) {
          setCurrentUserRole(foundRole);
        }
      } else {
        setError('Failed to load users');
      }
    } catch (err) {
      console.error('[Users Settings] Error:', err);
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    setInviting(true);
    setError(null);
    setSuccess(null);

    try {
      const headers = getAuthHeaders();
      const res = await fetch(`${API_URL}/api/v2/settings/users`, {
        method: 'POST',
        headers,
        body: JSON.stringify(inviteForm),
      });

      if (res.ok) {
        const data = await res.json();
        setSuccess(data.message || 'User added successfully!');
        setShowInviteModal(false);
        setInviteForm({ email: '', role: 'staff' });
        
        // Reload users
        await loadUsers();
        
        setTimeout(() => setSuccess(null), 3000);
      } else {
        const errorData = await res.json();
        setError(errorData.message || errorData.error || 'Failed to add user');
      }
    } catch (err) {
      console.error('[Users Settings] Error:', err);
      setError('Failed to add user. Please try again.');
    } finally {
      setInviting(false);
    }
  };

  const getRoleBadge = (role) => {
    const colors = {
      owner: { bg: 'rgba(20, 184, 166, 0.1)', text: 'var(--color-accent)' },
      admin: { bg: 'rgba(250, 204, 21, 0.1)', text: 'var(--color-accent-2)' },
      staff: { bg: 'rgba(0, 0, 0, 0.05)', text: 'var(--color-text-muted)' },
    };
    const color = colors[role] || colors.staff;
    
    return (
      <span
        className="px-2 py-1 text-xs font-medium"
        style={{
          backgroundColor: color.bg,
          color: color.text,
          borderRadius: 'var(--button-radius)',
        }}
      >
        {role.charAt(0).toUpperCase() + role.slice(1)}
      </span>
    );
  };

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
                <h1 className="text-3xl font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>Users & Roles</h1>
                <p style={{ color: 'var(--color-text-muted)' }}>
                  Manage organization members and their roles
                </p>
              </div>
              <button
                onClick={() => setShowInviteModal(true)}
                className="px-6 py-3 text-white font-medium transition-opacity"
                style={{
                  backgroundColor: 'var(--color-accent)',
                  borderRadius: 'var(--button-radius)',
                  height: 'var(--input-height)',
                }}
                onMouseEnter={(e) => e.target.style.opacity = '0.9'}
                onMouseLeave={(e) => e.target.style.opacity = '1'}
              >
                + Add User
              </button>
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

          {/* Pending Join Requests */}
          {joinRequests.length > 0 && (
            <div 
              className="shadow mb-6"
              style={{
                backgroundColor: 'var(--color-surface)',
                borderRadius: 'var(--card-radius)',
                padding: 'var(--padding-base)',
              }}
            >
              <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--color-text-main)' }}>
                Pending Join Requests ({joinRequests.length})
              </h2>
              <div className="space-y-3">
                {joinRequests.map((request) => (
                  <div
                    key={request.id}
                    className="p-4 border rounded"
                    style={{
                      borderColor: 'var(--color-border)',
                      borderRadius: 'var(--card-radius)',
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="font-medium" style={{ color: 'var(--color-text-main)' }}>
                            {request.user.email}
                          </span>
                          {(request.user.first_name || request.user.last_name) && (
                            <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                              ({[request.user.first_name, request.user.last_name].filter(Boolean).join(' ')})
                            </span>
                          )}
                        </div>
                        <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                          Requested role: <strong className="capitalize">{request.requested_role}</strong>
                          {request.message && (
                            <>
                              <br />
                              Message: {request.message}
                            </>
                          )}
                          <br />
                          Requested: {new Date(request.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApproveRequest(request.id, request.requested_role)}
                          className="px-4 py-2 text-sm font-medium transition-colors"
                          style={{
                            backgroundColor: 'var(--color-accent)',
                            color: 'white',
                            borderRadius: 'var(--button-radius)',
                          }}
                          onMouseEnter={(e) => e.target.style.opacity = '0.9'}
                          onMouseLeave={(e) => e.target.style.opacity = '1'}
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleRejectRequest(request.id)}
                          className="px-4 py-2 text-sm font-medium transition-colors"
                          style={{
                            backgroundColor: 'var(--color-surface)',
                            border: '1px solid var(--color-border)',
                            color: 'var(--color-text-main)',
                            borderRadius: 'var(--button-radius)',
                          }}
                          onMouseEnter={(e) => {
                            e.target.style.borderColor = 'var(--color-danger)';
                            e.target.style.color = 'var(--color-danger)';
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.borderColor = 'var(--color-border)';
                            e.target.style.color = 'var(--color-text-main)';
                          }}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Users List */}
          {users.length === 0 ? (
            <div 
              className="shadow p-12 text-center"
              style={{
                backgroundColor: 'var(--color-surface)',
                borderRadius: 'var(--card-radius)',
              }}
            >
              <p className="mb-4" style={{ color: 'var(--color-text-muted)' }}>No users found in this organization.</p>
              <button
                onClick={() => setShowInviteModal(true)}
                className="px-6 py-3 text-white font-medium transition-opacity"
                style={{
                  backgroundColor: 'var(--color-accent)',
                  borderRadius: 'var(--button-radius)',
                }}
              >
                Add First User
              </button>
            </div>
          ) : (
            <div 
              className="shadow"
              style={{
                backgroundColor: 'var(--color-surface)',
                borderRadius: 'var(--card-radius)',
                padding: 'var(--padding-base)',
              }}
            >
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b" style={{ borderColor: 'var(--color-border)' }}>
                      <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: 'var(--color-text-muted)' }}>Name</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: 'var(--color-text-muted)' }}>Email</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: 'var(--color-text-muted)' }}>Role</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: 'var(--color-text-muted)' }}>Joined</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold" style={{ color: 'var(--color-text-muted)' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-b" style={{ borderColor: 'var(--color-border)' }}>
                        <td className="py-3 px-4" style={{ color: 'var(--color-text-main)' }}>
                          {user.first_name || user.last_name 
                            ? `${user.first_name || ''} ${user.last_name || ''}`.trim()
                            : '—'}
                        </td>
                        <td className="py-3 px-4" style={{ color: 'var(--color-text-main)' }}>{user.email}</td>
                        <td className="py-3 px-4">
                          {getRoleBadge(user.role)}
                        </td>
                        <td className="py-3 px-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                          {user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => {
                              setManagingUser(user);
                              setShowManageModal(true);
                            }}
                            className="text-sm transition-colors"
                            style={{ color: 'var(--color-accent)' }}
                            onMouseEnter={(e) => e.target.style.opacity = '0.8'}
                            onMouseLeave={(e) => e.target.style.opacity = '1'}
                          >
                            Manage
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Permissions Section */}
          {!loadingPermissions && permissions.length > 0 && (
            <div 
              className="shadow mt-8"
              style={{
                backgroundColor: 'var(--color-surface)',
                borderRadius: 'var(--card-radius)',
                padding: 'var(--padding-base)',
              }}
            >
              <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--color-text-main)' }}>
                Role Permissions
              </h2>
              <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
                Permissions assigned to each role in your organization
              </p>
              
              <div className="space-y-6">
                {['owner', 'admin', 'staff'].map((role) => {
                  const rolePerms = rolePermissions[role] || [];
                  const isOwner = role === 'owner';
                  
                  return (
                    <div key={role} className="border rounded" style={{ borderColor: 'var(--color-border)', borderRadius: 'var(--card-radius)', padding: 'var(--padding-base)' }}>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-medium capitalize" style={{ color: 'var(--color-text-main)' }}>
                          {role}
                        </h3>
                        {getRoleBadge(role)}
                      </div>
                      
                      {permissions.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {permissions.map((perm) => {
                            const isChecked = rolePerms.includes(perm.key);
                            return (
                              <label
                                key={perm.key}
                                className="flex items-start p-3 rounded cursor-pointer transition-colors"
                                style={{
                                  backgroundColor: isChecked ? 'var(--color-background)' : 'transparent',
                                  border: `1px solid ${isChecked ? 'var(--color-accent)' : 'var(--color-border)'}`,
                                  borderRadius: 'var(--card-radius)',
                                  opacity: savingPermission ? 0.6 : 1,
                                }}
                                onMouseEnter={(e) => {
                                  if (!savingPermission) {
                                    e.currentTarget.style.backgroundColor = 'var(--color-background)';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!savingPermission) {
                                    e.currentTarget.style.backgroundColor = isChecked ? 'var(--color-background)' : 'transparent';
                                  }
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    if (!savingPermission) {
                                      handlePermissionChange(role, perm.key, e.target.checked);
                                    }
                                  }}
                                  disabled={savingPermission || (isOwner && isChecked && rolePerms.length === 1)}
                                  className="mt-0.5 mr-3 w-4 h-4 cursor-pointer"
                                  style={{
                                    accentColor: 'var(--color-accent)',
                                  }}
                                />
                                <div className="flex-1">
                                  <div className="text-sm font-medium" style={{ color: 'var(--color-text-main)' }}>
                                    {perm.key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                  </div>
                                  {perm.description && (
                                    <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                                      {perm.description}
                                    </div>
                                  )}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                          No permissions available
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              
              <div className="mt-6 p-4 rounded text-sm" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                <p style={{ color: 'var(--color-text-main)' }}>
                  <strong>Note:</strong> Permissions are currently set at the platform level. To customize permissions for your organization, contact support.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Invite User Modal */}
        {showInviteModal && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowInviteModal(false);
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
                Add User to Organization
              </h2>
              
              <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
                Add an existing user to this organization by their email address. The user must have already signed up for a Tavari account.
              </p>

              <form onSubmit={handleInvite}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                      Email Address *
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={inviteForm.email}
                      onChange={(e) => setInviteForm(prev => ({ ...prev, email: e.target.value }))}
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
                      placeholder="user@example.com"
                    />
                    <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                      The user must have an existing account with this email
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                      Role *
                    </label>
                    <select
                      name="role"
                      value={inviteForm.role}
                      onChange={(e) => setInviteForm(prev => ({ ...prev, role: e.target.value }))}
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
                      <option value="staff">Staff - Basic access</option>
                      <option value="admin">Admin - Manage settings</option>
                      <option value="owner">Owner - Full access</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    type="submit"
                    disabled={inviting}
                    className="flex-1 px-6 py-3 text-white font-medium transition-opacity disabled:opacity-50"
                    style={{
                      backgroundColor: 'var(--color-accent)',
                      borderRadius: 'var(--button-radius)',
                      height: 'var(--input-height)',
                    }}
                  >
                    {inviting ? 'Adding...' : 'Add User'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowInviteModal(false);
                      setError(null);
                      setInviteForm({ email: '', role: 'staff' });
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

        {/* Manage User Modal */}
        {showManageModal && managingUser && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowManageModal(false);
                setManagingUser(null);
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
                Manage User
              </h2>
              
              <div className="mb-6">
                <p className="text-sm mb-2" style={{ color: 'var(--color-text-muted)' }}>Email:</p>
                <p className="font-medium" style={{ color: 'var(--color-text-main)' }}>{managingUser.email}</p>
                {(managingUser.first_name || managingUser.last_name) && (
                  <>
                    <p className="text-sm mt-2 mb-2" style={{ color: 'var(--color-text-muted)' }}>Name:</p>
                    <p className="font-medium" style={{ color: 'var(--color-text-main)' }}>
                      {`${managingUser.first_name || ''} ${managingUser.last_name || ''}`.trim()}
                    </p>
                  </>
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

              {/* Update Role */}
              <div className="mb-6">
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                  Role
                </label>
                <select
                  value={managingUser.role}
                  onChange={async (e) => {
                    const newRole = e.target.value;
                    if (newRole === managingUser.role) return;
                    
                    setUpdating(true);
                    setError(null);
                    
                    try {
                      const headers = getAuthHeaders();
                      const res = await fetch(`${API_URL}/api/v2/settings/users/${managingUser.organization_user_id}`, {
                        method: 'PUT',
                        headers,
                        body: JSON.stringify({ role: newRole }),
                      });
                      
                      if (res.ok) {
                        const data = await res.json();
                        setSuccess(data.message || 'User role updated');
                        setManagingUser({ ...managingUser, role: newRole });
                        await loadUsers();
                        setTimeout(() => setSuccess(null), 3000);
                      } else {
                        const errorData = await res.json();
                        setError(errorData.message || errorData.error || 'Failed to update role');
                      }
                    } catch (err) {
                      console.error('[Users Settings] Error updating role:', err);
                      setError('Failed to update role');
                    } finally {
                      setUpdating(false);
                    }
                  }}
                  disabled={updating || (currentUserRole !== 'owner' && currentUserRole !== 'admin')}
                  className="w-full px-4 py-2 border rounded transition-colors focus:outline-none focus:ring-2 disabled:opacity-50"
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text-main)',
                    borderRadius: 'var(--button-radius)',
                    height: 'var(--input-height)',
                  }}
                >
                  <option value="staff">Staff - Basic access</option>
                  <option value="admin">Admin - Manage settings</option>
                  <option value="owner">Owner - Full access</option>
                </select>
                {updating && (
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>Updating...</p>
                )}
              </div>

              {/* Remove User */}
              {managingUser.role !== 'owner' || (currentUserRole === 'owner' && users.filter(u => u.role === 'owner').length > 1) ? (
                <div className="mb-6 p-4 border rounded" style={{ borderColor: 'var(--color-border)', borderRadius: 'var(--card-radius)' }}>
                  <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
                    Remove this user from the organization. They will lose access but their account will remain.
                  </p>
                  <button
                    onClick={async () => {
                      if (!confirm(`Are you sure you want to remove ${managingUser.email} from this organization?`)) {
                        return;
                      }
                      
                      setRemoving(true);
                      setError(null);
                      
                      try {
                        const headers = getAuthHeaders();
                        const res = await fetch(`${API_URL}/api/v2/settings/users/${managingUser.organization_user_id}`, {
                          method: 'DELETE',
                          headers,
                        });
                        
                        if (res.ok) {
                          const data = await res.json();
                          setSuccess(data.message || 'User removed');
                          setShowManageModal(false);
                          setManagingUser(null);
                          await loadUsers();
                          setTimeout(() => setSuccess(null), 3000);
                        } else {
                          const errorData = await res.json();
                          setError(errorData.message || errorData.error || 'Failed to remove user');
                        }
                      } catch (err) {
                        console.error('[Users Settings] Error removing user:', err);
                        setError('Failed to remove user');
                      } finally {
                        setRemoving(false);
                      }
                    }}
                    disabled={removing || (currentUserRole !== 'owner' && currentUserRole !== 'admin')}
                    className="w-full px-4 py-2 font-medium transition-opacity disabled:opacity-50"
                    style={{
                      backgroundColor: 'var(--color-danger)',
                      color: 'white',
                      borderRadius: 'var(--button-radius)',
                      height: 'var(--input-height)',
                    }}
                  >
                    {removing ? 'Removing...' : 'Remove from Organization'}
                  </button>
                </div>
              ) : (
                <div className="mb-6 p-4 rounded" style={{ backgroundColor: 'rgba(250, 204, 21, 0.1)', borderRadius: 'var(--card-radius)' }}>
                  <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                    This user is the only owner. Add another owner before removing them.
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowManageModal(false);
                    setManagingUser(null);
                    setError(null);
                  }}
                  className="flex-1 px-6 py-3 font-medium transition-colors"
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-main)',
                    borderRadius: 'var(--button-radius)',
                    height: 'var(--input-height)',
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </V2AppShell>
    </AuthGuard>
  );
}
