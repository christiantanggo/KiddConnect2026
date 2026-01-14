'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import { orbixNetworkAPI } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import { handleAPIError } from '@/lib/errorHandler';
import { ArrowLeft, Loader, Youtube, ExternalLink, Eye, ThumbsUp, MessageCircle } from 'lucide-react';

export default function OrbixNetworkPublishedPage() {
  const router = useRouter();
  const { error: showErrorToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [publishes, setPublishes] = useState([]);
  const [platformFilter, setPlatformFilter] = useState('');

  useEffect(() => {
    loadPublishes();
  }, [platformFilter]);

  const loadPublishes = async () => {
    try {
      setLoading(true);
      const params = {};
      if (platformFilter) params.platform = platformFilter;
      
      const response = await orbixNetworkAPI.getPublishes({ ...params, limit: 100 });
      setPublishes(response.data.publishes || []);
    } catch (error) {
      console.error('Failed to load published videos:', error);
      const errorInfo = handleAPIError(error);
      showErrorToast(errorInfo.message || 'Failed to load published videos');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const statusColors = {
      'PENDING': 'bg-yellow-100 text-yellow-800',
      'PROCESSING': 'bg-blue-100 text-blue-800',
      'PUBLISHED': 'bg-green-100 text-green-800',
      'FAILED': 'bg-red-100 text-red-800'
    };
    
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded ${statusColors[status] || 'bg-gray-100 text-gray-800'}`}>
        {status}
      </span>
    );
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    // Parse date string (assume UTC if no timezone info)
    let date;
    if (dateString.includes('Z') || dateString.includes('+') || dateString.includes('-', 10)) {
      // Already has timezone info
      date = new Date(dateString);
    } else {
      // Assume UTC if no timezone specified (database timestamps are typically UTC)
      date = new Date(dateString + 'Z');
    }
    // Convert to local timezone for display (browser's timezone)
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
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
              <h1 className="text-3xl font-bold mb-2">Published Videos</h1>
              <p className="text-gray-600">View all published videos</p>
            </div>
          </div>

          {/* Filter */}
          <div className="bg-white rounded-lg shadow p-4">
            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Platforms</option>
              <option value="YOUTUBE">YouTube</option>
              <option value="RUMBLE">Rumble</option>
            </select>
          </div>

          {/* Published Videos List */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6">
              {publishes.length === 0 ? (
                <div className="text-center py-12">
                  <Youtube className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 text-lg mb-2">No published videos yet</p>
                  <p className="text-gray-400 text-sm">
                    Published videos will appear here
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {publishes.map((publish) => (
                    <div key={publish.id} className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition-shadow">
                      <div className="p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex items-center gap-2">
                            {publish.platform === 'YOUTUBE' && (
                              <Youtube className="w-5 h-5 text-red-600" />
                            )}
                            <span className="text-sm font-medium text-gray-600">{publish.platform}</span>
                          </div>
                          {getStatusBadge(publish.publish_status)}
                        </div>
                        
                        <h3 className="font-semibold text-lg mb-2 line-clamp-2">
                          {publish.title}
                        </h3>
                        
                        {publish.description && (
                          <p className="text-sm text-gray-600 mb-4 line-clamp-3">
                            {publish.description}
                          </p>
                        )}

                        <div className="space-y-2 mb-4 text-sm text-gray-500">
                          <div>Published: {formatDate(publish.posted_at || publish.created_at)}</div>
                          {publish.platform_video_id && (
                            <div className="flex items-center gap-2 text-blue-600">
                              <span>Video ID: {publish.platform_video_id.substring(0, 20)}...</span>
                            </div>
                          )}
                        </div>

                        {publish.error_message && (
                          <div className="bg-red-50 border border-red-200 rounded p-2 mb-4">
                            <p className="text-sm text-red-800">{publish.error_message}</p>
                          </div>
                        )}

                        {publish.platform_video_id && publish.platform === 'YOUTUBE' && (
                          <a
                            href={`https://www.youtube.com/watch?v=${publish.platform_video_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-center text-sm flex items-center justify-center gap-2"
                          >
                            <ExternalLink className="w-4 h-4" />
                            Watch on YouTube
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}

