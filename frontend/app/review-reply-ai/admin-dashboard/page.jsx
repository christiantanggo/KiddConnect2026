'use client';

import { useState, useEffect } from 'react';
import AdminGuard from '@/components/AdminGuard';
import Link from 'next/link';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://api.tavarios.com').replace(/\/$/, '');

function ReviewsAdminPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const getAdminToken = () => {
    const cookies = document.cookie.split(';');
    const tokenCookie = cookies.find(c => c.trim().startsWith('admin_token='));
    return tokenCookie ? tokenCookie.split('=')[1] : null;
  };

  const loadStats = async () => {
    try {
      const token = getAdminToken();
      // TODO: Add reviews-specific stats endpoint
      // For now, just set loading to false
      setStats({
        total_reviews_generated: 0,
        total_feedback_received: 0,
        active_subscriptions: 0,
      });
    } catch (error) {
      console.error('Failed to load reviews stats:', error);
      setStats({
        total_reviews_generated: 0,
        total_feedback_received: 0,
        active_subscriptions: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    document.cookie = 'admin_token=; path=/; max-age=0';
    window.location.href = '/admin/login';
  };

  if (loading) {
    return (
      <AdminGuard>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-lg">Loading...</div>
        </div>
      </AdminGuard>
    );
  }

  return (
    <AdminGuard>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm">
          <div className="container mx-auto px-4 py-4 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Link href="/admin-dashboard" className="text-blue-600 hover:text-blue-700">
                ← Back to Dashboard
              </Link>
              <h1 className="text-xl font-bold text-blue-600">Tavari AI Review Reply - Admin</h1>
            </div>
            <div className="flex gap-4 items-center">
              <Link href="/admin/accounts" className="text-gray-700 hover:text-blue-600">
                Accounts
              </Link>
              <span className="text-gray-300">|</span>
              <Link href="/admin/support" className="text-gray-700 hover:text-blue-600">
                Support Tickets
              </Link>
              <span className="text-gray-300">|</span>
              <button
                onClick={handleLogout}
                className="text-gray-700 hover:text-blue-600"
              >
                Logout
              </button>
            </div>
          </div>
        </nav>

        <main className="container mx-auto px-4 py-8">
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900">Tavari AI Review Reply Statistics</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center p-4 bg-gray-50 rounded">
                <p className="text-2xl font-bold text-gray-900">{stats?.total_reviews_generated || 0}</p>
                <p className="text-sm text-gray-600">Total Reviews Generated</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded">
                <p className="text-2xl font-bold text-gray-900">{stats?.total_feedback_received || 0}</p>
                <p className="text-sm text-gray-600">Feedback Received</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded">
                <p className="text-2xl font-bold text-gray-900">{stats?.active_subscriptions || 0}</p>
                <p className="text-sm text-gray-600">Active Subscriptions</p>
              </div>
            </div>
          </div>

          {/* Marketing Pages */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900">Marketing Pages</h2>
            <div className="flex gap-4 flex-wrap">
              <a
                href="/review-reply-ai/landing"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium inline-flex items-center gap-2"
              >
                <span>Visit Pitch Page</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
              <a
                href="/review-reply-ai/thank-you"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium inline-flex items-center gap-2"
              >
                <span>Visit Thank You Page</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
              <a
                href="/review-reply-ai/clickbank"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 font-medium inline-flex items-center gap-2"
              >
                <span>Visit ClickBank Page</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>

          {/* Pricing Packages Management */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900">Pricing Packages</h2>
            <p className="text-sm text-gray-600 mb-4">
              Manage pricing packages for Tavari AI Review Reply. Create packages with different prompt limits.
            </p>
            <Link
              href="/review-reply-ai/package"
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
            >
              Manage Pricing Packages →
            </Link>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900">Module Management</h2>
            <p className="text-sm text-gray-600 mb-4">
              Tavari AI Review Reply administration features coming soon.
            </p>
            <div className="flex gap-4 flex-wrap">
              <Link
                href="/admin/accounts"
                className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
              >
                Manage Accounts
              </Link>
              <Link
                href="/admin/support"
                className="px-6 py-3 bg-orange-600 text-white rounded-md hover:bg-orange-700 font-medium"
              >
                Support Tickets
              </Link>
            </div>
          </div>
        </main>
      </div>
    </AdminGuard>
  );
}

export default ReviewsAdminPage;

