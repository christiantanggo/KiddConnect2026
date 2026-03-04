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
import { ArrowLeft, Loader, Video, Download, ExternalLink, RotateCw, Upload, Settings2 } from 'lucide-react';

export default function OrbixNetworkRendersPage() {
  const router = useRouter();
  const { success, error: showErrorToast } = useToast();
  const { currentChannelId, apiParams } = useOrbixChannel();
  const [loading, setLoading] = useState(true);
  const [renders, setRenders] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [uploadingId, setUploadingId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

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

  const getStatusLabel = (status) => {
    const labels = {
      PENDING: 'Pending',
      PROCESSING: 'Rendering',
      READY_FOR_UPLOAD: 'Ready to Review',
      COMPLETED: 'Published',
      FAILED: 'Failed',
      UPLOAD_FAILED: 'Upload Failed'
    };
    return labels[status] || status;
  };

  const getStatusBadge = (status) => {
    const statusColors = {
      PENDING: 'bg-yellow-100 text-yellow-800',
      PROCESSING: 'bg-blue-100 text-blue-800',
      READY_FOR_UPLOAD: 'bg-emerald-100 text-emerald-800',
      COMPLETED: 'bg-green-100 text-green-800',
      FAILED: 'bg-red-100 text-red-800',
      UPLOAD_FAILED: 'bg-orange-100 text-orange-800'
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded ${statusColors[status] || 'bg-gray-100 text-gray-800'}`}>
        {getStatusLabel(status)}
      </span>
    );
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    let date;
    if (dateString.includes('Z') || dateString.includes('+') || dateString.includes('-', 10)) {
      date = new Date(dateString);
    } else {
      date = new Date(dateString + 'Z');
    }
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleRestartRender = async (renderId, storyId) => {
    if (!window.confirm('Are you sure you want to restart this render? It will be re-queued for processing.')) return;
    try {
      await orbixNetworkAPI.restartRender(renderId, apiParams(), storyId);
      success('Render restarted. It will be processed again.');
      loadRenders();
    } catch (error) {
      console.error('Failed to restart render:', error);
      const errorInfo = handleAPIError(error);
      showErrorToast(errorInfo.message || 'Failed to restart render');
    }
  };

  const handleUploadToYouTube = async (renderId) => {
    if (!window.confirm('Upload this video to YouTube now?')) return;
    try {
      setUploadingId(renderId);
      await orbixNetworkAPI.uploadToYouTube(renderId, apiParams());
      success('YouTube upload started! Check back in a minute.');
      setTimeout(() => loadRenders(), 5000);
    } catch (error) {
      console.error('Failed to upload to YouTube:', error);
      const errorInfo = handleAPIError(error);
      showErrorToast(errorInfo.message || 'Failed to upload to YouTube');
    } finally {
      setUploadingId(null);
    }
  };

  const handleDownloadVideo = async (renderId) => {
    try {
      setDownloadingId(renderId);
      const res = await orbixNetworkAPI.downloadVideo(renderId, apiParams());
      const blob = res.data;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `orbix-video-${renderId}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      success('Video downloaded.');
    } catch (error) {
      console.error('Failed to download video:', error);
      const errorInfo = handleAPIError(error);
      showErrorToast(errorInfo.message || 'Failed to download video');
    } finally {
      setDownloadingId(null);
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
          <div className="flex justify-between items-start flex-wrap gap-4">
            <div>
              <Link
                href="/dashboard/v2/modules/orbix-network/dashboard"
                className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Link>
              <h1 className="text-3xl font-bold mb-2">Video Renders</h1>
              <p className="text-gray-600">Review renders before uploading to YouTube</p>
            </div>
            <Link
              href={`/dashboard/v2/modules/orbix-network/settings${currentChannelId ? `?channel=${currentChannelId}` : ''}`}
              className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm mt-8"
            >
              <Settings2 className="w-4 h-4" />
              Channel Settings
            </Link>
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
              <option value="READY_FOR_UPLOAD">Ready to Review</option>
              <option value="COMPLETED">Published</option>
              <option value="FAILED">Failed</option>
              <option value="UPLOAD_FAILED">Upload Failed</option>
            </select>
          </div>

          {/* Renders List */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6">
              {renders.length === 0 ? (
                <div className="text-center py-12">
                  <Video className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 text-lg mb-2">No renders yet</p>
                  <p className="text-gray-400 text-sm">Videos will appear here once rendering begins</p>
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
                        <div className="text-sm text-gray-500">Created: {formatDate(render.created_at)}</div>
                        {render.completed_at && (
                          <div className="text-sm text-gray-500">Completed: {formatDate(render.completed_at)}</div>
                        )}
                      </div>

                      {render.error_message && (
                        <div className="bg-red-50 border border-red-200 rounded p-2 mb-4">
                          <p className="text-sm text-red-800">{render.error_message}</p>
                        </div>
                      )}

                      <div className="flex flex-col gap-2 mt-4">
                        {/* READY_FOR_UPLOAD: view video + upload to YouTube */}
                        {render.render_status === 'READY_FOR_UPLOAD' && (
                          <>
                            {render.output_url && (
                              <>
                                <a
                                  href={`${render.output_url}${render.output_url.includes('?') ? '&' : '?'}v=${encodeURIComponent(render.updated_at || '')}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="w-full px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-center text-sm flex items-center justify-center gap-2"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                  Watch Video
                                </a>
                                <button
                                  type="button"
                                  onClick={() => handleDownloadVideo(render.id)}
                                  disabled={downloadingId === render.id}
                                  className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 text-center text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                                >
                                  {downloadingId === render.id ? (
                                    <Loader className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Download className="w-4 h-4" />
                                  )}
                                  Download video to computer
                                </button>
                              </>
                            )}
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleUploadToYouTube(render.id)}
                                disabled={uploadingId === render.id}
                                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-center text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                              >
                                {uploadingId === render.id ? (
                                  <Loader className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Upload className="w-4 h-4" />
                                )}
                                Upload to YouTube
                              </button>
                              <button
                                onClick={() => handleRestartRender(render.id, render.story_id)}
                                className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1 text-sm text-gray-600"
                                title="Re-render"
                              >
                                <RotateCw className="w-4 h-4" />
                              </button>
                            </div>
                          </>
                        )}

                        {/* COMPLETED (published) */}
                        {render.render_status === 'COMPLETED' && (
                          <div className="flex gap-2">
                            {render.output_url && (
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
                            )}
                            <button
                              onClick={() => handleRestartRender(render.id, render.story_id)}
                              className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1 text-sm"
                              title="Re-render"
                            >
                              <RotateCw className="w-4 h-4" />
                            </button>
                          </div>
                        )}

                        {/* FAILED */}
                        {render.render_status === 'FAILED' && (
                          <button
                            onClick={() => handleRestartRender(render.id, render.story_id)}
                            className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-center text-sm flex items-center justify-center gap-2"
                          >
                            <RotateCw className="w-4 h-4" />
                            Restart Render
                          </button>
                        )}

                        {/* UPLOAD_FAILED: video rendered OK, only YouTube upload failed */}
                        {render.render_status === 'UPLOAD_FAILED' && (
                          <>
                            {render.step_error && (
                              <div className="bg-orange-50 border border-orange-200 rounded p-2 mb-2">
                                <p className="text-xs text-orange-800">{render.step_error}</p>
                              </div>
                            )}
                            {render.output_url && (
                              <button
                                type="button"
                                onClick={() => handleDownloadVideo(render.id)}
                                disabled={downloadingId === render.id}
                                className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 text-center text-sm flex items-center justify-center gap-2 disabled:opacity-60 mb-2"
                              >
                                {downloadingId === render.id ? <Loader className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                Download video to computer
                              </button>
                            )}
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleUploadToYouTube(render.id)}
                                disabled={uploadingId === render.id}
                                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-center text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                              >
                                {uploadingId === render.id ? (
                                  <Loader className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Upload className="w-4 h-4" />
                                )}
                                Retry Upload
                              </button>
                              <button
                                onClick={() => handleRestartRender(render.id, render.story_id)}
                                className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1 text-sm text-gray-600"
                                title="Re-render from scratch"
                              >
                                <RotateCw className="w-4 h-4" />
                              </button>
                            </div>
                          </>
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
