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
import { ArrowLeft, Loader, CheckCircle, XCircle, Edit, X } from 'lucide-react';

export default function OrbixNetworkReviewPage() {
  const router = useRouter();
  const { success, error: showErrorToast } = useToast();
  const { currentChannelId, apiParams } = useOrbixChannel();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [editingHook, setEditingHook] = useState(false);
  const [hookText, setHookText] = useState('');

  useEffect(() => {
    if (!currentChannelId) {
      setLoading(false);
      setItems([]);
      return;
    }
    loadReviewQueue();
  }, [currentChannelId]);

  const loadReviewQueue = async () => {
    try {
      setLoading(true);
      const response = await orbixNetworkAPI.getReviewQueue(apiParams());
      console.log('[Review Queue] API Response:', response.data);
      setItems(response.data.items || []);
      console.log('[Review Queue] Items set:', response.data.items?.length || 0, 'items');
    } catch (error) {
      console.error('Failed to load review queue:', error);
      const errorInfo = handleAPIError(error);
      showErrorToast(errorInfo.message || 'Failed to load review queue');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (storyId) => {
    try {
      await orbixNetworkAPI.approveStory(storyId, apiParams());
      success('Story approved');
      loadReviewQueue();
      setSelectedItem(null);
    } catch (error) {
      console.error('Failed to approve story:', error);
      const errorInfo = handleAPIError(error);
      showErrorToast(errorInfo.message || 'Failed to approve story');
    }
  };

  const handleReject = async (storyId) => {
    try {
      await orbixNetworkAPI.rejectStory(storyId);
      success('Story rejected');
      loadReviewQueue();
      setSelectedItem(null);
    } catch (error) {
      console.error('Failed to reject story:', error);
      const errorInfo = handleAPIError(error);
      showErrorToast(errorInfo.message || 'Failed to reject story');
    }
  };

  const handleEditHook = async (storyId) => {
    try {
      await orbixNetworkAPI.editScriptHook(storyId, hookText, apiParams());
      success('Script hook updated');
      setEditingHook(false);
      loadReviewQueue();
    } catch (error) {
      console.error('Failed to edit script hook:', error);
      const errorInfo = handleAPIError(error);
      showErrorToast(errorInfo.message || 'Failed to edit script hook');
    }
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
              <h1 className="text-3xl font-bold mb-2">Review Queue</h1>
              <p className="text-gray-600">Review and approve stories before rendering</p>
            </div>
          </div>

          {/* Review Queue List */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6">
              {items.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 text-lg mb-2">No items pending review</p>
                  <p className="text-gray-400 text-sm">
                    Stories will appear here when review mode is enabled
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {items.map((item) => {
                    const story = item.orbix_stories;
                    const script = item.orbix_scripts;
                    
                    return (
                      <div
                        key={item.id}
                        className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 cursor-pointer transition-colors"
                        onClick={() => {
                          console.log('[Review Queue] Item clicked:', item);
                          console.log('[Review Queue] Story data:', item.orbix_stories);
                          console.log('[Review Queue] Script data:', item.orbix_scripts);
                          setSelectedItem(item);
                          setHookText(script?.hook || '');
                          setEditingHook(false);
                        }}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h3 className="font-semibold text-lg mb-2">
                              {story?.title || 'Untitled Story'}
                            </h3>
                            {story?.snippet && (
                              <p className="text-gray-600 text-sm mb-3 line-clamp-2">
                                {story.snippet}
                              </p>
                            )}
                            {script?.hook && (
                              <div className="bg-gray-50 rounded p-3 mb-3">
                                <p className="text-sm font-medium text-gray-700 mb-1">Script Hook:</p>
                                <p className="text-sm text-gray-600">{script.hook}</p>
                              </div>
                            )}
                            <div className="flex gap-4 text-sm text-gray-500">
                              <span>Score: <strong className="text-gray-900">{story?.shock_score}/100</strong></span>
                              <span>Queued: {formatDate(item.created_at)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Review Modal */}
          {selectedItem && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white">
                  <h2 className="text-2xl font-bold">Review Story</h2>
                  <button
                    onClick={() => setSelectedItem(null)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
                <div className="p-6 space-y-6">
                  {(() => {
                    const story = selectedItem.orbix_stories;
                    const script = selectedItem.orbix_scripts;
                    
                    console.log('[Review Modal] Selected item:', selectedItem);
                    console.log('[Review Modal] Story:', story);
                    console.log('[Review Modal] Script:', script);
                    console.log('[Review Modal] Script content_json:', script?.content_json);
                    
                    return (
                      <>
                        <div>
                          <h3 className="font-semibold text-lg mb-2">Story Title</h3>
                          <p className="text-gray-900">{story?.title || 'Untitled (No title available)'}</p>
                          {!story && <p className="text-red-500 text-sm mt-1">⚠️ Story data is missing</p>}
                        </div>
                        
                        {story?.snippet ? (
                          <div>
                            <h3 className="font-semibold text-lg mb-2">Snippet</h3>
                            <p className="text-gray-600">{story.snippet}</p>
                          </div>
                        ) : (
                          <div>
                            <h3 className="font-semibold text-lg mb-2">Snippet</h3>
                            <p className="text-gray-400 italic">No snippet available</p>
                          </div>
                        )}
                        
                        <div>
                          <h3 className="font-semibold text-lg mb-2">Shock Score</h3>
                          <p className="text-2xl font-bold">{story?.shock_score ?? 'N/A'}/100</p>
                          {story?.category && (
                            <p className="text-sm text-gray-500 mt-1">Category: {story.category}</p>
                          )}
                        </div>
                        
                        {script ? (
                          <div>
                            <div className="flex justify-between items-center mb-2">
                              <h3 className="font-semibold text-lg">Script</h3>
                              {!editingHook && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingHook(true);
                                  }}
                                  className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                >
                                  <Edit className="w-4 h-4" />
                                  Edit Hook
                                </button>
                              )}
                            </div>
                            
                            {editingHook ? (
                              <div className="space-y-3">
                                <textarea
                                  value={hookText}
                                  onChange={(e) => setHookText(e.target.value)}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                                  rows="3"
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEditHook(story.id);
                                    }}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                  >
                                    Save Hook
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingHook(false);
                                      setHookText(script.hook || '');
                                    }}
                                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-3 bg-gray-50 rounded-lg p-4">
                                {script.hook && (
                                  <div>
                                    <p className="text-sm font-medium text-gray-700 mb-1">Hook:</p>
                                    <p className="text-gray-900">{script.hook}</p>
                                  </div>
                                )}
                                {script.what_happened && (
                                  <div>
                                    <p className="text-sm font-medium text-gray-700 mb-1">What Happened:</p>
                                    <p className="text-gray-600">{script.what_happened}</p>
                                  </div>
                                )}
                                {script.why_it_matters && (
                                  <div>
                                    <p className="text-sm font-medium text-gray-700 mb-1">Why It Matters:</p>
                                    <p className="text-gray-600">{script.why_it_matters}</p>
                                  </div>
                                )}
                                {script.what_happens_next && (
                                  <div>
                                    <p className="text-sm font-medium text-gray-700 mb-1">What Happens Next:</p>
                                    <p className="text-gray-600">{script.what_happens_next}</p>
                                  </div>
                                )}
                                {script.cta_line && (
                                  <div>
                                    <p className="text-sm font-medium text-gray-700 mb-1">Call to Action:</p>
                                    <p className="text-gray-600">{script.cta_line}</p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <h3 className="font-semibold text-lg mb-2">Script</h3>
                            <p className="text-gray-400 italic">No script available</p>
                            {!script && <p className="text-red-500 text-sm mt-1">⚠️ Script data is missing</p>}
                          </div>
                        )}
                        
                        {story?.url && (
                          <div>
                            <h3 className="font-semibold text-lg mb-2">Source URL</h3>
                            <a
                              href={story.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 break-all"
                            >
                              {story.url}
                            </a>
                          </div>
                        )}
                        
                        <div className="flex gap-4 pt-4 border-t border-gray-200">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleApprove(story.id);
                            }}
                            className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center gap-2"
                          >
                            <CheckCircle className="w-5 h-5" />
                            Approve
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReject(story.id);
                            }}
                            className="flex-1 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center justify-center gap-2"
                          >
                            <XCircle className="w-5 h-5" />
                            Reject
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}

