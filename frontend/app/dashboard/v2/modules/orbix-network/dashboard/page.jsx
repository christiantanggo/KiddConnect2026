'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import { orbixNetworkAPI } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import { handleAPIError } from '@/lib/errorHandler';
import { Loader, TrendingUp, Video, FileText, Eye, Play, RefreshCw, X, XCircle, RotateCw } from 'lucide-react';

export default function OrbixNetworkDashboard() {
  const router = useRouter();
  const { success, error: showErrorToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rawItems, setRawItems] = useState([]);
  const [stories, setStories] = useState([]);
  const [renders, setRenders] = useState([]);
  const [publishes, setPublishes] = useState([]);
  const [selectedRender, setSelectedRender] = useState(null);
  const [renderDetails, setRenderDetails] = useState(null);
  const [loadingRenderDetails, setLoadingRenderDetails] = useState(false);
  const [stats, setStats] = useState({
    totalRawItems: 0,
    totalStories: 0,
    totalRenders: 0,
    totalPublishes: 0,
    totalViews: 0
  });
  const [runningJobs, setRunningJobs] = useState({
    scrape: false,
    process: false,
    reviewQueue: false,
    render: false,
    publish: false
  });
  const isLoadingDataRef = useRef(false); // Prevent concurrent loadDashboardData calls
  const rateLimitedRef = useRef(false); // Track if we're rate limited
  const autoRefreshIntervalRef = useRef(null); // Store interval reference

  useEffect(() => {
    checkSetupAndLoadData();
  }, []);

  // Auto-refresh dashboard data every 5 seconds if there are PENDING or PROCESSING renders
  useEffect(() => {
    // Clear any existing interval first
    if (autoRefreshIntervalRef.current) {
      console.log('[Orbix Dashboard] Clearing existing auto-refresh interval');
      clearInterval(autoRefreshIntervalRef.current);
      autoRefreshIntervalRef.current = null;
    }
    
    const hasActiveRenders = renders.some(r => r.render_status === 'PENDING' || r.render_status === 'PROCESSING');
    console.log('[Orbix Dashboard] Auto-refresh check - hasActiveRenders:', hasActiveRenders, 'renders count:', renders.length, 'rateLimited:', rateLimitedRef.current);
    
    // Don't set up auto-refresh if rate limited
    if (rateLimitedRef.current) {
      console.log('[Orbix Dashboard] Rate limited - NOT setting up auto-refresh');
      return;
    }
    
    if (!hasActiveRenders) {
      console.log('[Orbix Dashboard] No active renders - skipping auto-refresh');
      return;
    }
    
    console.log('[Orbix Dashboard] Setting up auto-refresh interval (5 seconds)...');
    autoRefreshIntervalRef.current = setInterval(() => {
      // Don't refresh if already loading or rate limited
      if (isLoadingDataRef.current) {
        console.log('[Orbix Dashboard] Auto-refresh skipped - already loading data');
        return;
      }
      if (rateLimitedRef.current) {
        console.log('[Orbix Dashboard] Auto-refresh skipped - rate limited');
        return;
      }
      console.log('[Orbix Dashboard] Auto-refresh triggered - reloading dashboard data...');
      loadDashboardData();
    }, 5000);
    
    return () => {
      console.log('[Orbix Dashboard] Cleaning up auto-refresh interval');
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current);
        autoRefreshIntervalRef.current = null;
      }
    };
  }, [renders.length]); // Only re-run when renders array length changes

  const checkSetupAndLoadData = async () => {
    try {
      setLoading(true);
      
      // Check setup status first
      const setupRes = await orbixNetworkAPI.getSetupStatus();
      
      // If setup not complete, redirect to setup
      if (!setupRes.data.setup_status?.is_complete) {
        router.push('/modules/orbix-network/setup');
        return;
      }
      
      // Setup complete - load dashboard data
      await loadDashboardData();
    } catch (error) {
      console.error('Failed to check setup:', error);
      const errorInfo = handleAPIError(error);
      if (errorInfo.redirect) {
        router.push(errorInfo.redirect);
        return;
      }
      showErrorToast(errorInfo.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const loadDashboardData = async () => {
    // Prevent concurrent calls
    if (isLoadingDataRef.current) {
      console.log('[Orbix Dashboard] loadDashboardData already in progress - skipping');
      return;
    }
    
    // Don't load if rate limited
    if (rateLimitedRef.current) {
      console.log('[Orbix Dashboard] Rate limited - skipping loadDashboardData');
      return;
    }
    
    isLoadingDataRef.current = true;
    console.log('[Orbix Dashboard] ========== LOAD DASHBOARD DATA START ==========');
    
    try {
      setLoading(true);
      
      // Load raw items, stories, renders, and publishes in parallel
      console.log('[Orbix Dashboard] Fetching dashboard data in parallel...');
      const [rawItemsRes, storiesRes, rendersRes, publishesRes] = await Promise.all([
        orbixNetworkAPI.getRawItems({ limit: 10 }),
        orbixNetworkAPI.getStories({ limit: 10 }),
        orbixNetworkAPI.getRenders({ limit: 5 }),
        orbixNetworkAPI.getPublishes({ limit: 5 })
      ]);
      
      console.log('[Orbix Dashboard] Dashboard data fetched successfully');
      setRawItems(rawItemsRes.data.raw_items || []);
      setStories(storiesRes.data.stories || []);
      setRenders(rendersRes.data.renders || []);
      setPublishes(publishesRes.data.publishes || []);
      
      // Calculate stats
      setStats({
        totalRawItems: rawItemsRes.data.raw_items?.length || 0,
        totalStories: storiesRes.data.stories?.length || 0,
        totalRenders: rendersRes.data.renders?.length || 0,
        totalPublishes: publishesRes.data.publishes?.length || 0,
        totalViews: publishesRes.data.publishes?.reduce((sum, p) => sum + (p.views || 0), 0) || 0
      });
      
      // If we were rate limited before, clear it now
      if (rateLimitedRef.current) {
        console.log('[Orbix Dashboard] Rate limit cleared - requests successful');
        rateLimitedRef.current = false;
      }
      
      console.log('[Orbix Dashboard] ========== LOAD DASHBOARD DATA SUCCESS ==========');
    } catch (error) {
      console.error('[Orbix Dashboard] ========== LOAD DASHBOARD DATA ERROR ==========');
      console.error('[Orbix Dashboard] Error:', error);
      console.error('[Orbix Dashboard] Error response status:', error?.response?.status);
      
      // Check if it's a rate limit error (429)
      if (error?.response?.status === 429) {
        console.error('[Orbix Dashboard] RATE LIMIT DETECTED - Stopping auto-refresh and retries');
        rateLimitedRef.current = true;
        
        // Clear auto-refresh interval
        if (autoRefreshIntervalRef.current) {
          console.log('[Orbix Dashboard] Clearing auto-refresh due to rate limit');
          clearInterval(autoRefreshIntervalRef.current);
          autoRefreshIntervalRef.current = null;
        }
        
        // Show error but don't retry
        showErrorToast('Rate limit exceeded. Please wait a moment before refreshing.');
        
        // Clear rate limit after 60 seconds
        setTimeout(() => {
          console.log('[Orbix Dashboard] Rate limit cooldown expired - clearing flag');
          rateLimitedRef.current = false;
        }, 60000);
        
        return; // Exit early - don't show generic error
      }
      
      const errorInfo = handleAPIError(error);
      showErrorToast(errorInfo.message || 'Failed to load dashboard data');
      if (errorInfo.redirect) {
        router.push(errorInfo.redirect);
      }
    } finally {
      setLoading(false);
      isLoadingDataRef.current = false;
      console.log('[Orbix Dashboard] loadDashboardData complete - loading flag reset');
    }
  };

  const getStatusBadge = (status) => {
    const statusColors = {
      'QUEUED': 'bg-yellow-100 text-yellow-800',
      'APPROVED': 'bg-green-100 text-green-800',
      'REJECTED': 'bg-red-100 text-red-800',
      'RENDERED': 'bg-blue-100 text-blue-800',
      'PUBLISHED': 'bg-purple-100 text-purple-800',
      'PENDING': 'bg-gray-100 text-gray-800',
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

  const handleRenderClick = async (render) => {
    // Allow clicking on PENDING, PROCESSING, COMPLETED, or FAILED renders
    if (!['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'].includes(render.render_status)) {
      return;
    }
    
    setSelectedRender(render);
    setLoadingRenderDetails(true);
    
    try {
      const response = await orbixNetworkAPI.getRender(render.id);
      setRenderDetails(response.data.render);
    } catch (error) {
      console.error('Failed to load render details:', error);
      showErrorToast('Failed to load render details');
    } finally {
      setLoadingRenderDetails(false);
    }
  };

  const handleCancelRender = async (renderId) => {
    try {
      await orbixNetworkAPI.deleteRender(renderId);
      success('Render cancelled');
      setSelectedRender(null);
      setRenderDetails(null);
      loadDashboardData(); // Reload data to refresh the list
    } catch (error) {
      console.error('Failed to cancel render:', error);
      const errorInfo = handleAPIError(error);
      showErrorToast(errorInfo.message || 'Failed to cancel render');
    }
  };

  const handleRestartRender = async (renderId) => {
    console.log('[Orbix Dashboard] ========== RESTART RENDER START ==========');
    console.log('[Orbix Dashboard] Render ID:', renderId);
    console.log('[Orbix Dashboard] Current render details:', selectedRender);
    
    try {
      console.log('[Orbix Dashboard] Calling orbixNetworkAPI.restartRender...');
      const startTime = Date.now();
      
      const response = await orbixNetworkAPI.restartRender(renderId);
      
      const duration = Date.now() - startTime;
      console.log('[Orbix Dashboard] restartRender API call completed in', duration, 'ms');
      console.log('[Orbix Dashboard] API Response:', response);
      
      success('Render restarted. It will be processed again.');
      setSelectedRender(null);
      setRenderDetails(null);
      
      console.log('[Orbix Dashboard] Reloading dashboard data...');
      await loadDashboardData();
      console.log('[Orbix Dashboard] Dashboard data reloaded');
      console.log('[Orbix Dashboard] ========== RESTART RENDER SUCCESS ==========');
    } catch (error) {
      console.error('[Orbix Dashboard] ========== RESTART RENDER ERROR ==========');
      console.error('[Orbix Dashboard] Error type:', error?.constructor?.name);
      console.error('[Orbix Dashboard] Error message:', error?.message);
      console.error('[Orbix Dashboard] Error stack:', error?.stack);
      console.error('[Orbix Dashboard] Full error object:', error);
      console.error('[Orbix Dashboard] Error response:', error?.response);
      console.error('[Orbix Dashboard] Error response data:', error?.response?.data);
      console.error('[Orbix Dashboard] Error response status:', error?.response?.status);
      console.error('[Orbix Dashboard] ========== END ERROR ==========');
      
      const errorInfo = handleAPIError(error);
      showErrorToast(errorInfo.message || 'Failed to restart render');
    }
  };

  const triggerJob = async (jobName, jobFunction) => {
    console.log('[Orbix Dashboard] ========== TRIGGER JOB START ==========');
    console.log('[Orbix Dashboard] Job name:', jobName);
    console.log('[Orbix Dashboard] Job function:', jobFunction?.name || 'anonymous');
    
    try {
      setRunningJobs(prev => ({ ...prev, [jobName]: true }));
      console.log('[Orbix Dashboard] Calling job function...');
      const startTime = Date.now();
      
      const response = await jobFunction();
      
      const duration = Date.now() - startTime;
      console.log('[Orbix Dashboard] Job function completed in', duration, 'ms');
      console.log('[Orbix Dashboard] Job response:', response);
      
      // For scrape job, show detailed results
      if (jobName === 'scrape' && response.data?.results) {
        const result = response.data.results[0]; // First business result
        if (result) {
          const message = result.error 
            ? `Scrape failed: ${result.error}`
            : `Scraped ${result.scraped || 0} items from ${result.enabled_sources || 0} source(s). Saved ${result.saved || 0} items.`;
          if (result.error) {
            showErrorToast(message);
          } else {
            success(message);
            if (result.disabled_sources > 0) {
              showErrorToast(`${result.disabled_sources} source(s) are disabled. Enable them in Settings to scrape.`);
            }
          }
        } else {
          success(`${jobName} job completed successfully`);
        }
      } else {
        success(`${jobName} job completed successfully`);
      }
      
      // Reload dashboard data after a short delay
      console.log('[Orbix Dashboard] Scheduling dashboard reload in 2 seconds...');
      setTimeout(async () => {
        console.log('[Orbix Dashboard] Reloading dashboard data after job completion...');
        await loadDashboardData();
        console.log('[Orbix Dashboard] Dashboard data reloaded after job');
      }, 2000);
      
      console.log('[Orbix Dashboard] ========== TRIGGER JOB SUCCESS ==========');
      return response;
    } catch (error) {
      console.error('[Orbix Dashboard] ========== TRIGGER JOB ERROR ==========');
      console.error('[Orbix Dashboard] Job name:', jobName);
      console.error('[Orbix Dashboard] Error type:', error?.constructor?.name);
      console.error('[Orbix Dashboard] Error message:', error?.message);
      console.error('[Orbix Dashboard] Error stack:', error?.stack);
      console.error('[Orbix Dashboard] Full error object:', error);
      console.error('[Orbix Dashboard] Error response:', error?.response);
      console.error('[Orbix Dashboard] Error response data:', error?.response?.data);
      console.error('[Orbix Dashboard] Error response status:', error?.response?.status);
      console.error('[Orbix Dashboard] ========== END ERROR ==========');
      
      const errorInfo = handleAPIError(error);
      showErrorToast(errorInfo.message || `Failed to trigger ${jobName} job`);
    } finally {
      setRunningJobs(prev => ({ ...prev, [jobName]: false }));
      console.log('[Orbix Dashboard] Job running state set to false for:', jobName);
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
              <h1 className="text-3xl font-bold mb-2">Orbix Network</h1>
              <p className="text-gray-600">Automated video news network</p>
            </div>
            <div className="flex gap-3">
              <Link
                href="/dashboard/v2/modules/orbix-network/stories"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                View All Stories
              </Link>
            </div>
          </div>

          {/* Manual Job Triggers */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Manual Job Triggers</h2>
            <p className="text-sm text-gray-600 mb-4">
              Manually trigger background jobs for testing. Jobs normally run automatically on a schedule.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <Link
                href="/dashboard/v2/modules/orbix-network/scraped"
                className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-center"
              >
                <Play className="w-4 h-4" />
                Scrape & View
              </Link>
              
              <button
                onClick={() => triggerJob('process', orbixNetworkAPI.triggerProcessJob)}
                disabled={runningJobs.process}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {runningJobs.process ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Process
                  </>
                )}
              </button>
              
              <button
                onClick={() => triggerJob('reviewQueue', orbixNetworkAPI.triggerReviewQueueJob)}
                disabled={runningJobs.reviewQueue}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {runningJobs.reviewQueue ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Review Queue
                  </>
                )}
              </button>
              
              <button
                onClick={() => {
                  console.log('[Orbix Dashboard] ========== RENDER BUTTON CLICKED ==========');
                  console.log('[Orbix Dashboard] Button clicked at:', new Date().toISOString());
                  console.log('[Orbix Dashboard] Running jobs state:', runningJobs);
                  console.log('[Orbix Dashboard] Calling triggerJob with render...');
                  triggerJob('render', orbixNetworkAPI.triggerRenderJob);
                }}
                disabled={runningJobs.render}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {runningJobs.render ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Render
                  </>
                )}
              </button>
              
              <button
                onClick={() => triggerJob('publish', orbixNetworkAPI.triggerPublishJob)}
                disabled={runningJobs.publish}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {runningJobs.publish ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Publish
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Raw Items</p>
                  <p className="text-2xl font-bold">{stats.totalRawItems}</p>
                </div>
                <RefreshCw className="w-8 h-8 text-orange-600" />
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Stories Processed</p>
                  <p className="text-2xl font-bold">{stats.totalStories}</p>
                </div>
                <FileText className="w-8 h-8 text-blue-600" />
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Videos Rendered</p>
                  <p className="text-2xl font-bold">{stats.totalRenders}</p>
                </div>
                <Video className="w-8 h-8 text-green-600" />
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Published Videos</p>
                  <p className="text-2xl font-bold">{stats.totalPublishes}</p>
                </div>
                <TrendingUp className="w-8 h-8 text-purple-600" />
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Total Views</p>
                  <p className="text-2xl font-bold">{stats.totalViews.toLocaleString()}</p>
                </div>
                <Eye className="w-8 h-8 text-orange-600" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Recent Raw Items */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200 flex justify-between items-center">
                <h2 className="text-xl font-semibold">Recent Raw Items</h2>
              </div>
              <div className="p-6">
                {rawItems.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No raw items yet. Run the Scrape job to fetch news items.</p>
                ) : (
                  <div className="space-y-4">
                    {rawItems.slice(0, 5).map((item) => (
                      <div key={item.id} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                        <div className="flex flex-col">
                          <p className="font-medium text-sm line-clamp-2 mb-2">{item.title || 'Untitled'}</p>
                          <div className="flex gap-2 mb-2">
                            <span className={`px-2 py-1 text-xs rounded ${
                              item.status === 'NEW' ? 'bg-yellow-100 text-yellow-800' :
                              item.status === 'PROCESSED' ? 'bg-green-100 text-green-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {item.status}
                            </span>
                          </div>
                          {item.url && (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:text-blue-700 break-all"
                              title={item.url}
                            >
                              {item.url}
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Recent Stories */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200 flex justify-between items-center">
                <h2 className="text-xl font-semibold">Recent Stories</h2>
                <Link
                  href="/dashboard/v2/modules/orbix-network/stories"
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  View All →
                </Link>
              </div>
              <div className="p-6">
                {stories.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No stories yet</p>
                ) : (
                  <div className="space-y-4">
                    {stories.slice(0, 5).map((story) => {
                      // Determine navigation path based on status
                      const isQueued = story.status === 'PENDING' || story.status === 'QUEUED';
                      const storyPath = isQueued 
                        ? '/dashboard/v2/modules/orbix-network/review'
                        : '/dashboard/v2/modules/orbix-network/stories';
                      
                      return (
                        <Link
                          key={story.id}
                          href={storyPath}
                          className="block border-b border-gray-100 pb-4 last:border-0 last:pb-0 hover:bg-gray-50 -mx-2 px-2 rounded transition-colors cursor-pointer"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex-1">
                              <p className="font-medium text-sm line-clamp-2">{story.title || 'Untitled Story'}</p>
                              <div className="flex gap-2 mt-2">
                                {getCategoryBadge(story.category)}
                                {getStatusBadge(story.status)}
                              </div>
                            </div>
                            <div className="text-right ml-4">
                              <p className="text-xs text-gray-500">Score</p>
                              <p className="text-sm font-semibold">{story.shock_score}/100</p>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Recent Renders */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200 flex justify-between items-center">
                <h2 className="text-xl font-semibold">Recent Renders</h2>
                <Link
                  href="/dashboard/v2/modules/orbix-network/renders"
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  View All →
                </Link>
              </div>
              <div className="p-6">
                {renders.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No renders yet</p>
                ) : (
                  <div className="space-y-4">
                    {renders.slice(0, 5).map((render) => {
                      const canClick = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'].includes(render.render_status);
                      const isFailed = render.render_status === 'FAILED';
                      const isCompleted = render.render_status === 'COMPLETED';
                      
                      return (
                        <div
                          key={render.id}
                          className={`border-b border-gray-100 pb-4 last:border-0 last:pb-0 ${canClick ? 'cursor-pointer hover:bg-gray-50' : ''} -mx-2 px-2 rounded transition-colors`}
                          onClick={canClick ? () => handleRenderClick(render) : undefined}
                        >
                          <div className="flex justify-between items-center">
                            <div className="flex-1">
                              <div className="flex gap-2 mb-2 items-center">
                                {getStatusBadge(render.render_status)}
                                <span className="text-xs text-gray-500">
                                  Template {render.template} • {render.background_type}
                                </span>
                              </div>
                              {/* Progress Bar for PENDING or PROCESSING renders */}
                              {(render.render_status === 'PENDING' || render.render_status === 'PROCESSING') && (
                                <div className="mt-2 mb-2">
                                  <div className="flex justify-between items-center mb-1">
                                    <span className="text-xs text-gray-600">Progress</span>
                                    <span className="text-xs font-medium text-gray-700">
                                      {render.progress_percentage || 0}%
                                    </span>
                                  </div>
                                  <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div
                                      className={`h-2 rounded-full transition-all duration-300 ${
                                        render.render_status === 'PROCESSING' 
                                          ? 'bg-blue-600' 
                                          : 'bg-gray-400'
                                      }`}
                                      style={{ width: `${render.progress_percentage || 0}%` }}
                                    />
                                  </div>
                                  {render.render_status === 'PENDING' && render.progress_percentage === 0 && (
                                    <p className="text-xs text-gray-500 mt-1">Waiting to start...</p>
                                  )}
                                </div>
                              )}
                              {render.output_url && (
                                <a
                                  href={render.output_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm text-blue-600 hover:text-blue-700"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  View Video →
                                </a>
                              )}
                              {(isFailed || isCompleted) && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRestartRender(render.id);
                                  }}
                                  className="mt-2 px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 flex items-center gap-1"
                                >
                                  <RotateCw className="w-3 h-3" />
                                  Restart
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Published Videos */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-xl font-semibold">Published Videos</h2>
              <Link
                href="/dashboard/v2/modules/orbix-network/published"
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                View All →
              </Link>
            </div>
            <div className="p-6">
              {publishes.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No published videos yet</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {publishes.map((publish) => (
                    <div key={publish.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        {getStatusBadge(publish.publish_status)}
                      </div>
                      <h3 className="font-medium text-sm mb-2 line-clamp-2">{publish.title}</h3>
                      {publish.platform_video_id && (
                        <a
                          href={`https://www.youtube.com/watch?v=${publish.platform_video_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:text-blue-700"
                        >
                          Watch on YouTube →
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Render Progress Modal */}
          {selectedRender && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white">
                  <h2 className="text-2xl font-bold">Render Progress</h2>
                  <button
                    onClick={() => {
                      setSelectedRender(null);
                      setRenderDetails(null);
                    }}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
                <div className="p-6 space-y-6">
                  {loadingRenderDetails ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader className="w-8 h-8 animate-spin text-blue-600" />
                    </div>
                  ) : renderDetails ? (
                    <>
                      <div className="flex gap-2">
                        {getStatusBadge(renderDetails.render_status || selectedRender.render_status)}
                      </div>
                      
                      {renderDetails.orbix_stories && (
                        <div>
                          <h3 className="font-semibold text-lg mb-2">Story</h3>
                          <p className="text-gray-900">{renderDetails.orbix_stories.title || 'Untitled Story'}</p>
                          <div className="flex gap-2 mt-2">
                            {getCategoryBadge(renderDetails.orbix_stories.category)}
                            <span className="text-sm text-gray-500">
                              Score: {renderDetails.orbix_stories.shock_score}/100
                            </span>
                          </div>
                        </div>
                      )}
                      
                      <div>
                        <h3 className="font-semibold text-lg mb-2">Render Details</h3>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Template:</span>
                            <span className="font-medium">{renderDetails.template || selectedRender.template}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Background:</span>
                            <span className="font-medium">
                              {renderDetails.background_type || selectedRender.background_type} (ID: {renderDetails.background_id || selectedRender.background_id})
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Created:</span>
                            <span className="font-medium">{formatDate(renderDetails.created_at || selectedRender.created_at)}</span>
                          </div>
                          {renderDetails.updated_at && (
                            <div className="flex justify-between">
                              <span className="text-gray-600">Last Updated:</span>
                              <span className="font-medium">{formatDate(renderDetails.updated_at)}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Progress Bar */}
                      {(renderDetails.render_status === 'PENDING' || renderDetails.render_status === 'PROCESSING' || selectedRender.render_status === 'PENDING' || selectedRender.render_status === 'PROCESSING') && (
                        <div>
                          <h3 className="font-semibold text-lg mb-2">Render Progress</h3>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-gray-600">Progress</span>
                              <span className="text-sm font-medium text-gray-700">
                                {renderDetails.progress_percentage || selectedRender.progress_percentage || 0}%
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-3">
                              <div
                                className={`h-3 rounded-full transition-all duration-300 ${
                                  (renderDetails.render_status === 'PROCESSING' || selectedRender.render_status === 'PROCESSING')
                                    ? 'bg-blue-600' 
                                    : 'bg-gray-400'
                                }`}
                                style={{ 
                                  width: `${renderDetails.progress_percentage || selectedRender.progress_percentage || 0}%` 
                                }}
                              />
                            </div>
                            {(renderDetails.render_status === 'PENDING' || selectedRender.render_status === 'PENDING') && 
                             (renderDetails.progress_percentage === 0 || selectedRender.progress_percentage === 0) && (
                              <p className="text-sm text-gray-500 mt-1">Waiting to start processing...</p>
                            )}
                            {(renderDetails.render_status === 'PROCESSING' || selectedRender.render_status === 'PROCESSING') && (
                              <p className="text-sm text-gray-500 mt-1">Rendering video... This may take a few minutes.</p>
                            )}
                          </div>
                        </div>
                      )}

                      {renderDetails.error_message && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                          <h3 className="font-semibold text-lg mb-2 text-red-800">Error</h3>
                          <p className="text-red-700 text-sm">{renderDetails.error_message}</p>
                        </div>
                      )}

                      <div className="flex gap-4 pt-4 border-t border-gray-200">
                        {(renderDetails.render_status === 'PENDING' || renderDetails.render_status === 'PROCESSING' || selectedRender.render_status === 'PENDING' || selectedRender.render_status === 'PROCESSING') && (
                          <button
                            onClick={() => handleCancelRender(selectedRender.id)}
                            className="flex-1 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center justify-center gap-2"
                          >
                            <XCircle className="w-5 h-5" />
                            Cancel Render
                          </button>
                        )}
                        
                        {(renderDetails.render_status === 'COMPLETED' || renderDetails.render_status === 'FAILED' || selectedRender.render_status === 'COMPLETED' || selectedRender.render_status === 'FAILED') && (
                          <button
                            onClick={() => handleRestartRender(selectedRender.id)}
                            className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
                          >
                            <RotateCw className="w-5 h-5" />
                            Restart Render
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      Failed to load render details
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

