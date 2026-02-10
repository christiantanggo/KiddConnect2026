'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import { orbixNetworkAPI } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import { handleAPIError } from '@/lib/errorHandler';
import { useOrbixChannel } from '../OrbixChannelContext';
import { ArrowLeft, Loader, Video, Download, ExternalLink, RotateCw } from 'lucide-react';

export default function OrbixNetworkRendersPage() {
  const router = useRouter();
  const { success, error: showErrorToast } = useToast();
  const { currentChannelId, apiParams } = useOrbixChannel();
  const [loading, setLoading] = useState(true);
  const [renders, setRenders] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    if (!currentChannelId) {
      setLoading(false);
      setRenders([]);
      return;
    }
    loadRenders();
  }, [statusFilter, currentChannelId]);

  const loadRenders = async () => {
    try {
      setLoading(true);
      const params = {};
      if (statusFilter) params.status = statusFilter;
      
      const response = await orbixNetworkAPI.getRenders({ ...params, limit: 100 });
      setRenders(response.data.renders || []);
    } catch (error) {
      console.error('Failed to load renders:', error);
      const errorInfo = handleAPIError(error);
      showErrorToast(errorInfo.message || 'Failed to load renders');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const statusColors = {
      'PENDING': 'bg-yellow-100 text-yellow-800',
      'PROCESSING': 'bg-blue-100 text-blue-800',
      'COMPLETED': 'bg-green-100 text-green-800',
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

  const handleRestartRender = async (renderId) => {
    if (!window.confirm('Are you sure you want to restart this render? It will be re-queued for processing.')) {
      return;
    }
    try {
      await orbixNetworkAPI.restartRender(renderId, apiParams());
      success('Render restarted. It will be processed again.');
      loadRenders(); // Reload the list
    } catch (error) {
      console.error('Failed to restart render:', error);
      const errorInfo = handleAPIError(error);
      showErrorToast(errorInfo.message || 'Failed to restart render');
    }
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
              <h1 className="text-3xl font-bold mb-2">Video Renders</h1>
              <p className="text-gray-600">View and manage rendered videos</p>
            </div>
          </div>

          {/* Filter */}
          <div className="bg-white rounded-lg shadow p-4">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="PROCESSING">Processing</option>
              <option value="COMPLETED">Completed</option>
              <option value="FAILED">Failed</option>
            </select>
          </div>

          {/* Renders List */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6">
              {renders.length === 0 ? (
                <div className="text-center py-12">
                  <Video className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 text-lg mb-2">No renders yet</p>
                  <p className="text-gray-400 text-sm">
                    Videos will appear here once rendering begins
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {renders.map((render) => (
                    <div key={render.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-3">
                        {getStatusBadge(render.render_status)}
                      </div>
                      
                      <div className="space-y-2 mb-4">
                        <div className="text-sm text-gray-600">
                          <span className="font-medium">Template:</span> {render.template}
                        </div>
                        <div className="text-sm text-gray-600">
                          <span className="font-medium">Background:</span> {render.background_type} #{render.background_id}
                        </div>
                        <div className="text-sm text-gray-500">
                          Created: {formatDate(render.created_at)}
                        </div>
                        {render.completed_at && (
                          <div className="text-sm text-gray-500">
                            Completed: {formatDate(render.completed_at)}
                          </div>
                        )}
                      </div>

                      {render.error_message && (
                        <div className="bg-red-50 border border-red-200 rounded p-2 mb-4">
                          <p className="text-sm text-red-800">{render.error_message}</p>
                        </div>
                      )}

                      <div className="flex gap-2 mt-4">
                        {render.render_status === 'COMPLETED' && (
                          <>
                            {render.output_url ? (
                              <>
                                <a
                                  href={`${render.output_url}${render.output_url.includes('?') ? '&' : '?'}v=${encodeURIComponent(render.updated_at || '')}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-center text-sm flex items-center justify-center gap-2"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                  View Render
                                </a>
                                <a
                                  href={`${render.output_url}${render.output_url.includes('?') ? '&' : '?'}v=${encodeURIComponent(render.updated_at || '')}`}
                                  download
                                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
                                >
                                  <Download className="w-4 h-4" />
                                </a>
                              </>
                            ) : (
                              <button
                                onClick={() => handleRestartRender(render.id)}
                                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-center text-sm flex items-center justify-center gap-2"
                              >
                                <RotateCw className="w-4 h-4" />
                                View Render (restart to generate link)
                              </button>
                            )}
                            {render.output_url && (
                              <button
                                onClick={() => handleRestartRender(render.id)}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-center text-sm flex items-center justify-center gap-2"
                              >
                                <RotateCw className="w-4 h-4" />
                                Re-Render
                              </button>
                            )}
                          </>
                        )}
                        {render.render_status === 'FAILED' && (
                          <button
                            onClick={() => handleRestartRender(render.id)}
                            className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-center text-sm flex items-center justify-center gap-2"
                          >
                            <RotateCw className="w-4 h-4" />
                            Restart Render
                          </button>
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

