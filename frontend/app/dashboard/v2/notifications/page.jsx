'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import { ArrowLeft, Check, Bell } from 'lucide-react';
import api from '@/lib/api';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://api.tavarios.com').replace(/\/$/, '');

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [markingAllRead, setMarkingAllRead] = useState(false);

  useEffect(() => {
    loadNotifications();
    // Poll for new notifications every 30 seconds
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
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

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const businessId = typeof window !== 'undefined' 
        ? localStorage.getItem('activeBusinessId') || localStorage.getItem('businessId')
        : null;

      if (!businessId) {
        setLoading(false);
        return;
      }

      headers['X-Active-Business-Id'] = businessId;
      
      const res = await fetch(`${API_URL}/api/v2/notifications`, { headers });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch (err) {
      console.error('[Notifications] Error loading notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId) => {
    try {
      const headers = getAuthHeaders();
      const res = await fetch(`${API_URL}/api/v2/notifications/${notificationId}/read`, {
        method: 'PUT',
        headers,
      });
      
      if (res.ok) {
        // Update local state
        setNotifications(prev => 
          prev.map(n => n.id === notificationId ? { ...n, read_at: new Date().toISOString() } : n)
        );
      }
    } catch (err) {
      console.error('[Notifications] Error marking as read:', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      setMarkingAllRead(true);
      const headers = getAuthHeaders();
      const businessId = typeof window !== 'undefined' 
        ? localStorage.getItem('activeBusinessId') || localStorage.getItem('businessId')
        : null;

      if (!businessId) return;

      headers['X-Active-Business-Id'] = businessId;
      
      const res = await fetch(`${API_URL}/api/v2/notifications/read-all`, {
        method: 'PUT',
        headers,
      });
      
      if (res.ok) {
        // Update local state
        setNotifications(prev => 
          prev.map(n => ({ ...n, read_at: new Date().toISOString() }))
        );
        // Reload to update unread count in header
        window.location.reload();
      }
    } catch (err) {
      console.error('[Notifications] Error marking all as read:', err);
    } finally {
      setMarkingAllRead(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined 
    });
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'warning':
        return '⚠️';
      case 'billing':
        return '💳';
      case 'limit':
        return '📊';
      case 'module':
        return '📦';
      default:
        return 'ℹ️';
    }
  };

  const unreadCount = notifications.filter(n => !n.read_at).length;

  return (
    <AuthGuard>
      <V2AppShell>
        <div 
          style={{ 
            maxWidth: 'var(--max-content-width)', 
            margin: '0 auto',
            padding: 'calc(var(--padding-base) * 1.5) var(--padding-base)',
            minHeight: 'calc(100vh - var(--topbar-height))',
          }}
        >
          <div className="mb-6">
            <Link 
              href="/dashboard/v2" 
              className="text-sm mb-4 inline-flex items-center gap-2 transition-colors"
              style={{ color: 'var(--color-text-muted)' }}
              onMouseEnter={(e) => e.target.style.color = 'var(--color-text-main)'}
              onMouseLeave={(e) => e.target.style.color = 'var(--color-text-muted)'}
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </Link>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>
                  Notifications
                </h1>
                <p style={{ color: 'var(--color-text-muted)' }}>
                  {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : 'All caught up!'}
                </p>
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  disabled={markingAllRead}
                  className="px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                  style={{
                    backgroundColor: 'var(--color-accent)',
                    color: 'white',
                    borderRadius: 'var(--button-radius)',
                  }}
                >
                  {markingAllRead ? 'Marking...' : 'Mark All as Read'}
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center min-h-[40vh]">
              <div className="text-lg" style={{ color: 'var(--color-text-muted)' }}>Loading notifications...</div>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[40vh]">
              <Bell className="w-16 h-16 mb-4" style={{ color: 'var(--color-text-muted)' }} />
              <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>
                No notifications
              </h2>
              <p style={{ color: 'var(--color-text-muted)' }}>
                You're all caught up! New notifications will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className="p-4 transition-all cursor-pointer"
                  style={{
                    backgroundColor: notification.read_at ? 'var(--color-surface)' : 'rgba(20, 184, 166, 0.05)',
                    border: `1px solid ${notification.read_at ? 'var(--color-border)' : 'var(--color-accent)'}`,
                    borderRadius: 'var(--card-radius)',
                    borderLeft: `4px solid ${notification.read_at ? 'var(--color-border)' : 'var(--color-accent)'}`,
                  }}
                  onMouseEnter={(e) => {
                    if (!notification.read_at) {
                      e.currentTarget.style.backgroundColor = 'rgba(20, 184, 166, 0.1)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!notification.read_at) {
                      e.currentTarget.style.backgroundColor = 'rgba(20, 184, 166, 0.05)';
                    }
                  }}
                  onClick={() => !notification.read_at && markAsRead(notification.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xl">{getNotificationIcon(notification.type)}</span>
                        <span 
                          className="text-xs font-medium px-2 py-1 rounded"
                          style={{
                            backgroundColor: notification.read_at 
                              ? 'rgba(0, 0, 0, 0.05)' 
                              : 'rgba(20, 184, 166, 0.2)',
                            color: notification.read_at 
                              ? 'var(--color-text-muted)' 
                              : 'var(--color-accent)',
                          }}
                        >
                          {notification.type}
                        </span>
                        {!notification.read_at && (
                          <span 
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: 'var(--color-accent)' }}
                          />
                        )}
                      </div>
                      <p 
                        className="text-sm mb-2"
                        style={{ 
                          color: 'var(--color-text-main)',
                          fontWeight: notification.read_at ? 'normal' : '500',
                        }}
                      >
                        {notification.message}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {formatDate(notification.created_at)}
                      </p>
                    </div>
                    {!notification.read_at && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          markAsRead(notification.id);
                        }}
                        className="ml-4 p-2 transition-colors"
                        style={{
                          color: 'var(--color-accent)',
                          borderRadius: 'var(--button-radius)',
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.backgroundColor = 'rgba(20, 184, 166, 0.1)';
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.backgroundColor = 'transparent';
                        }}
                        title="Mark as read"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}

