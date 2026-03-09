'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import { orbixNetworkAPI } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import { handleAPIError } from '@/lib/errorHandler';
import { ArrowLeft, Loader, TrendingUp, Video, Eye, ThumbsUp, MessageCircle } from 'lucide-react';

export default function OrbixNetworkAnalyticsPage() {
  const router = useRouter();
  const { error: showErrorToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [publishes, setPublishes] = useState([]);
  const [dailyAnalytics, setDailyAnalytics] = useState([]);
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30); // Last 30 days
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  useEffect(() => {
    loadAnalytics();
  }, [startDate, endDate]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const response = await orbixNetworkAPI.getAnalytics({
        start_date: startDate,
        end_date: endDate
      });
      setPublishes(response.data.publishes || []);
      setDailyAnalytics(response.data.daily_analytics || []);
    } catch (error) {
      console.error('Failed to load analytics:', error);
      const errorInfo = handleAPIError(error);
      showErrorToast(errorInfo.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  // Calculate statistics
  const totalVideos = publishes.length;
  const totalViews = publishes.reduce((sum, p) => sum + (p.views || 0), 0);
  const totalLikes = publishes.reduce((sum, p) => sum + (p.likes || 0), 0);
  const totalComments = publishes.reduce((sum, p) => sum + (p.comments || 0), 0);
  const avgViews = totalVideos > 0 ? Math.round(totalViews / totalVideos) : 0;
  const avgEngagement = totalViews > 0 ? Math.round(((totalLikes + totalComments) / totalViews) * 100) : 0;

  // Background type comparison
  const backgroundStats = publishes.reduce((acc, p) => {
    const render = p.orbix_renders;
    if (render) {
      const bgType = render.background_type || 'UNKNOWN';
      if (!acc[bgType]) {
        acc[bgType] = { count: 0, views: 0, likes: 0 };
      }
      acc[bgType].count++;
      acc[bgType].views += p.views || 0;
      acc[bgType].likes += p.likes || 0;
    }
    return acc;
  }, {});

  // Template comparison
  const templateStats = publishes.reduce((acc, p) => {
    const render = p.orbix_renders;
    if (render) {
      const template = render.template || 'UNKNOWN';
      if (!acc[template]) {
        acc[template] = { count: 0, views: 0, likes: 0 };
      }
      acc[template].count++;
      acc[template].views += p.views || 0;
      acc[template].likes += p.likes || 0;
    }
    return acc;
  }, {});

  // Category comparison
  const categoryStats = publishes.reduce((acc, p) => {
    const story = p.orbix_renders?.orbix_stories;
    if (story?.category) {
      const category = story.category;
      if (!acc[category]) {
        acc[category] = { count: 0, views: 0, likes: 0 };
      }
      acc[category].count++;
      acc[category].views += p.views || 0;
      acc[category].likes += p.likes || 0;
    }
    return acc;
  }, {});

  const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  if (loading) {
    return (
      <AuthGuard>
        <V2AppShell>
          <div className="flex items-center justify-center min-h-screen">
            <Loader className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        </V2AppShell>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <V2AppShell>
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex justify-between items-center">
            <div>
              <Link
                href="/dashboard/v2/modules/orbix-network/dashboard"
                className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Link>
              <h1 className="text-3xl font-bold mb-2">Analytics</h1>
              <p className="text-gray-600">Performance metrics and comparisons</p>
            </div>
          </div>

          {/* Date Range Filter */}
          <div className="bg-white rounded-lg shadow p-4 flex gap-4 items-center">
            <label className="text-sm font-medium text-gray-700">Date Range:</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            />
            <span className="text-gray-500">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            />
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-2">
                <Video className="w-5 h-5 text-gray-400" />
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
              <p className="text-sm text-gray-600 mb-1">Total Videos</p>
              <p className="text-2xl font-bold">{totalVideos}</p>
            </div>
            
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-2">
                <Eye className="w-5 h-5 text-gray-400" />
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
              <p className="text-sm text-gray-600 mb-1">Total Views</p>
              <p className="text-2xl font-bold">{formatNumber(totalViews)}</p>
            </div>
            
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-2">
                <ThumbsUp className="w-5 h-5 text-gray-400" />
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
              <p className="text-sm text-gray-600 mb-1">Total Likes</p>
              <p className="text-2xl font-bold">{formatNumber(totalLikes)}</p>
            </div>
            
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-2">
                <MessageCircle className="w-5 h-5 text-gray-400" />
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
              <p className="text-sm text-gray-600 mb-1">Total Comments</p>
              <p className="text-2xl font-bold">{formatNumber(totalComments)}</p>
            </div>
            
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-2">
                <TrendingUp className="w-5 h-5 text-gray-400" />
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
              <p className="text-sm text-gray-600 mb-1">Avg Views</p>
              <p className="text-2xl font-bold">{formatNumber(avgViews)}</p>
            </div>
          </div>

          {/* Performance Comparisons */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Background Type Comparison */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-bold mb-4">Background Type Performance</h2>
              <div className="space-y-4">
                {Object.entries(backgroundStats).map(([type, stats]) => (
                  <div key={type} className="border-b border-gray-200 pb-4 last:border-0 last:pb-0">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium">{type}</span>
                      <span className="text-sm text-gray-500">{stats.count} videos</span>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Avg Views:</span>
                        <span className="font-medium">{formatNumber(Math.round(stats.views / stats.count || 0))}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Avg Likes:</span>
                        <span className="font-medium">{formatNumber(Math.round(stats.likes / stats.count || 0))}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {Object.keys(backgroundStats).length === 0 && (
                  <p className="text-gray-500 text-sm">No data available</p>
                )}
              </div>
            </div>

            {/* Template Comparison */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-bold mb-4">Template Performance</h2>
              <div className="space-y-4">
                {Object.entries(templateStats).map(([template, stats]) => (
                  <div key={template} className="border-b border-gray-200 pb-4 last:border-0 last:pb-0">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium">Template {template}</span>
                      <span className="text-sm text-gray-500">{stats.count} videos</span>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Avg Views:</span>
                        <span className="font-medium">{formatNumber(Math.round(stats.views / stats.count || 0))}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Avg Likes:</span>
                        <span className="font-medium">{formatNumber(Math.round(stats.likes / stats.count || 0))}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {Object.keys(templateStats).length === 0 && (
                  <p className="text-gray-500 text-sm">No data available</p>
                )}
              </div>
            </div>

            {/* Category Comparison */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-bold mb-4">Category Performance</h2>
              <div className="space-y-4">
                {Object.entries(categoryStats).map(([category, stats]) => {
                  const categoryNames = {
                    'ai-automation': 'AI & Automation',
                    'corporate-collapses': 'Corporate',
                    'tech-decisions': 'Tech',
                    'laws-rules': 'Laws & Rules',
                    'money-markets': 'Money & Markets'
                  };
                  
                  return (
                    <div key={category} className="border-b border-gray-200 pb-4 last:border-0 last:pb-0">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium">{categoryNames[category] || category}</span>
                        <span className="text-sm text-gray-500">{stats.count} videos</span>
                      </div>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Avg Views:</span>
                          <span className="font-medium">{formatNumber(Math.round(stats.views / stats.count || 0))}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Avg Likes:</span>
                          <span className="font-medium">{formatNumber(Math.round(stats.likes / stats.count || 0))}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {Object.keys(categoryStats).length === 0 && (
                  <p className="text-gray-500 text-sm">No data available</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}

