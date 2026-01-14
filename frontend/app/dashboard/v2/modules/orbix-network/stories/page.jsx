'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import { orbixNetworkAPI } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import { handleAPIError } from '@/lib/errorHandler';
import { ArrowLeft, Loader, Filter, X, CheckCircle } from 'lucide-react';

export default function OrbixNetworkStoriesPage() {
  const router = useRouter();
  const { success, error: showErrorToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [stories, setStories] = useState([]);
  const [selectedStory, setSelectedStory] = useState(null);
  const [filters, setFilters] = useState({
    category: '',
    status: ''
  });

  useEffect(() => {
    loadStories();
  }, [filters]);

  const loadStories = async () => {
    try {
      setLoading(true);
      const params = {};
      if (filters.category) params.category = filters.category;
      if (filters.status) params.status = filters.status;
      
      const response = await orbixNetworkAPI.getStories({ ...params, limit: 100 });
      setStories(response.data.stories || []);
    } catch (error) {
      console.error('Failed to load stories:', error);
      const errorInfo = handleAPIError(error);
      showErrorToast(errorInfo.message || 'Failed to load stories');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const statusColors = {
      'QUEUED': 'bg-yellow-100 text-yellow-800',
      'APPROVED': 'bg-green-100 text-green-800',
      'REJECTED': 'bg-red-100 text-red-800',
      'RENDERED': 'bg-blue-100 text-blue-800',
      'PUBLISHED': 'bg-purple-100 text-purple-800'
    };
    
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded ${statusColors[status] || 'bg-gray-100 text-gray-800'}`}>
        {status}
      </span>
    );
  };

  const getCategoryBadge = (category) => {
    const categoryNames = {
      'ai-automation': 'AI & Automation',
      'corporate-collapses': 'Corporate',
      'tech-decisions': 'Tech',
      'laws-rules': 'Laws & Rules',
      'money-markets': 'Money & Markets'
    };
    
    return (
      <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
        {categoryNames[category] || category}
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

  const handleApprove = async (storyId) => {
    try {
      await orbixNetworkAPI.approveStory(storyId);
      success('Story approved');
      loadStories();
      setSelectedStory(null);
    } catch (error) {
      console.error('Failed to approve story:', error);
      const errorInfo = handleAPIError(error);
      showErrorToast(errorInfo.message || 'Failed to approve story');
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
              <h1 className="text-3xl font-bold mb-2">Stories</h1>
              <p className="text-gray-600">Manage and review processed stories</p>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg shadow p-4 flex gap-4 items-center">
            <Filter className="w-5 h-5 text-gray-500" />
            <select
              value={filters.category}
              onChange={(e) => setFilters({ ...filters, category: e.target.value })}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Categories</option>
              <option value="ai-automation">AI & Automation</option>
              <option value="corporate-collapses">Corporate Collapses</option>
              <option value="tech-decisions">Tech Decisions</option>
              <option value="laws-rules">Laws & Rules</option>
              <option value="money-markets">Money & Markets</option>
            </select>
            
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Statuses</option>
              <option value="QUEUED">Queued</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="RENDERED">Rendered</option>
              <option value="PUBLISHED">Published</option>
            </select>

            {(filters.category || filters.status) && (
              <button
                onClick={() => setFilters({ category: '', status: '' })}
                className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1"
              >
                <X className="w-4 h-4" />
                Clear Filters
              </button>
            )}
          </div>

          {/* Stories List */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6">
              {stories.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500 text-lg mb-2">No stories found</p>
                  <p className="text-gray-400 text-sm">
                    {filters.category || filters.status 
                      ? 'Try adjusting your filters'
                      : 'Stories will appear here once processing begins'}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {stories.map((story) => (
                    <div
                      key={story.id}
                      className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 cursor-pointer transition-colors"
                      onClick={() => setSelectedStory(story)}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex gap-2 mb-2">
                            {getCategoryBadge(story.category)}
                            {getStatusBadge(story.status)}
                          </div>
                          <h3 className="font-semibold text-lg mb-2">
                            {story.title || 'Untitled Story'}
                          </h3>
                          {story.snippet && (
                            <p className="text-gray-600 text-sm mb-3 line-clamp-2">
                              {story.snippet}
                            </p>
                          )}
                          <div className="flex gap-4 text-sm text-gray-500">
                            <span>Score: <strong className="text-gray-900">{story.shock_score}/100</strong></span>
                            <span>Created: {formatDate(story.created_at)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Story Detail Modal */}
          {selectedStory && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white">
                  <h2 className="text-2xl font-bold">Story Details</h2>
                  <button
                    onClick={() => setSelectedStory(null)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  <div className="flex gap-2">
                    {getCategoryBadge(selectedStory.category)}
                    {getStatusBadge(selectedStory.status)}
                  </div>
                  
                  <div>
                    <h3 className="font-semibold text-lg mb-2">Shock Score</h3>
                    <p className="text-2xl font-bold">{selectedStory.shock_score}/100</p>
                  </div>

                  {selectedStory.factors_json && (
                    <div>
                      <h3 className="font-semibold text-lg mb-2">Scoring Factors</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <span className="text-sm text-gray-600">Scale:</span>
                          <span className="ml-2 font-semibold">{selectedStory.factors_json.scale || 0}/30</span>
                        </div>
                        <div>
                          <span className="text-sm text-gray-600">Speed:</span>
                          <span className="ml-2 font-semibold">{selectedStory.factors_json.speed || 0}/20</span>
                        </div>
                        <div>
                          <span className="text-sm text-gray-600">Power Shift:</span>
                          <span className="ml-2 font-semibold">{selectedStory.factors_json.power_shift || 0}/25</span>
                        </div>
                        <div>
                          <span className="text-sm text-gray-600">Permanence:</span>
                          <span className="ml-2 font-semibold">{selectedStory.factors_json.permanence || 0}/15</span>
                        </div>
                        <div>
                          <span className="text-sm text-gray-600">Explainability:</span>
                          <span className="ml-2 font-semibold">{selectedStory.factors_json.explainability || 0}/10</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <h3 className="font-semibold text-lg mb-2">Created</h3>
                    <p className="text-gray-600">{formatDate(selectedStory.created_at)}</p>
                  </div>

                  {/* Approve button for rejected stories */}
                  {selectedStory.status === 'REJECTED' && (
                    <div className="flex gap-4 pt-4 border-t border-gray-200">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleApprove(selectedStory.id);
                        }}
                        className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center gap-2"
                      >
                        <CheckCircle className="w-5 h-5" />
                        Approve Story
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}

