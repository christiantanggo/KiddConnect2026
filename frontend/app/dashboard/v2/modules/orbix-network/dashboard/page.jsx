'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import { orbixNetworkAPI } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import { handleAPIError } from '@/lib/errorHandler';
import { useOrbixChannel } from '../OrbixChannelContext';
import { Loader, TrendingUp, Video, FileText, Eye, Play, RefreshCw, X, XCircle, RotateCw, AlertTriangle } from 'lucide-react';
import PipelineView from './PipelineView';
import VideoDetailModal from './VideoDetailModal';
import OrbixChannelSelector from '../OrbixChannelSelector';

// Renders in PROCESSING/PENDING longer than this are treated as "stuck" - we stop polling and show a cancel option
const STUCK_RENDER_MINUTES = 60;
function isRenderStuck(r) {
  if (r.render_status !== 'PENDING' && r.render_status !== 'PROCESSING') return false;
  const updated = r.updated_at || r.created_at;
  if (!updated) return true;
  const updatedAt = new Date(updated);
  const cutoff = new Date(Date.now() - STUCK_RENDER_MINUTES * 60 * 1000);
  return updatedAt < cutoff;
}

export default function OrbixNetworkDashboard() {
  const router = useRouter();
  const { success, error: showErrorToast } = useToast();
  const { currentChannelId, apiParams, apiBody, channels, loading: channelsLoading } = useOrbixChannel();
  const [loading, setLoading] = useState(true);
  const [rawItems, setRawItems] = useState([]);
  const [stories, setStories] = useState([]);
  const [renders, setRenders] = useState([]);
  const [publishes, setPublishes] = useState([]);
  const [pipeline, setPipeline] = useState([]);
  const [selectedRender, setSelectedRender] = useState(null);
  const [renderDetails, setRenderDetails] = useState(null);
  const [loadingRenderDetails, setLoadingRenderDetails] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [stats, setStats] = useState({
    totalRawItems: 0,
    totalStories: 0,
    totalRenders: 0,
    totalPublishes: 0,
    totalViews: 0
  });
  const [runningJobs, setRunningJobs] = useState({
    scrape: false,
    pipeline: false,
    process: false,
    reviewQueue: false,
    render: false,
    publish: false
  });
  const [cancellingStuck, setCancellingStuck] = useState(false);
  const isLoadingDataRef = useRef(false); // Prevent concurrent loadDashboardData calls
  const rateLimitedRef = useRef(false); // Track if we're rate limited
  const serverUnreachableRef = useRef(false); // When true, stop polling to avoid console flood
  const autoRefreshIntervalRef = useRef(null); // Store interval reference
  const hasCheckedSetupRef = useRef(false); // Prevent multiple setup checks
  const isCheckingSetupRef = useRef(false); // Prevent concurrent setup checks

  useEffect(() => {
    if (!hasCheckedSetupRef.current && !isCheckingSetupRef.current) {
      hasCheckedSetupRef.current = true;
      setTimeout(() => checkSetupAndLoadData(), 500);
    }
  }, []);

  // When channel is selected (or changes), load dashboard data if setup is already complete
  useEffect(() => {
    if (!currentChannelId || isCheckingSetupRef.current || isLoadingDataRef.current) return;
    if (!hasCheckedSetupRef.current) return;
    loadDashboardData();
  }, [currentChannelId]);

  // Ref to track current renders for interval callback
  const rendersRef = useRef(renders);
  useEffect(() => {
    rendersRef.current = renders;
  }, [renders]);

  // Auto-refresh every 5s only for renders that are actually in progress (not stuck)
  useEffect(() => {
    const activeRenders = renders.filter(r =>
      (r.render_status === 'PENDING' || r.render_status === 'PROCESSING') && !isRenderStuck(r)
    );
    const hasActiveRenders = activeRenders.length > 0;

    if (autoRefreshIntervalRef.current) {
      clearInterval(autoRefreshIntervalRef.current);
      autoRefreshIntervalRef.current = null;
    }
    if (rateLimitedRef.current || !hasActiveRenders) return;

    autoRefreshIntervalRef.current = setInterval(() => {
      const currentRenders = rendersRef.current;
      const stillActive = currentRenders.some(r =>
        (r.render_status === 'PENDING' || r.render_status === 'PROCESSING') && !isRenderStuck(r)
      );
      if (!stillActive) {
        if (autoRefreshIntervalRef.current) {
          clearInterval(autoRefreshIntervalRef.current);
          autoRefreshIntervalRef.current = null;
        }
        return;
      }
      if (isLoadingDataRef.current || rateLimitedRef.current || serverUnreachableRef.current) return;
      checkRenderStatus();
      refreshPipelineData();
    }, 5000);

    return () => {
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current);
        autoRefreshIntervalRef.current = null;
      }
    };
  }, [renders.map(r => `${r.id}-${r.render_status}-${r.updated_at || r.created_at}`).join(',')]);

  const checkSetupAndLoadData = async () => {
    // Prevent concurrent calls
    if (isCheckingSetupRef.current) {
      console.log('[Orbix Dashboard] checkSetupAndLoadData already in progress - skipping');
      return;
    }
    
    // Don't check if rate limited
    if (rateLimitedRef.current) {
      console.log('[Orbix Dashboard] Rate limited - skipping setup check');
      return;
    }
    
    isCheckingSetupRef.current = true;
    console.log('[Orbix Dashboard] ========== CHECK SETUP START ==========');
    
    try {
      setLoading(true);
      
      // Check setup status first
      console.log('[Orbix Dashboard] Checking setup status...');
      const setupRes = await orbixNetworkAPI.getSetupStatus();
      console.log('[Orbix Dashboard] Setup status:', setupRes.data);
      
      // If setup not complete, redirect to setup
      if (!setupRes.data.setup_status?.is_complete) {
        console.log('[Orbix Dashboard] Setup not complete - redirecting to setup');
        router.push('/modules/orbix-network/setup');
        return;
      }
      
      // Setup complete - load dashboard data only when a channel is selected
      if (currentChannelId) {
        console.log('[Orbix Dashboard] Setup complete - loading dashboard data');
        await loadDashboardData();
      }
      console.log('[Orbix Dashboard] ========== CHECK SETUP SUCCESS ==========');
    } catch (error) {
      console.error('[Orbix Dashboard] ========== CHECK SETUP ERROR ==========');
      console.error('[Orbix Dashboard] Error:', error);
      console.error('[Orbix Dashboard] Error response status:', error?.response?.status);
      
      // Handle rate limiting
      if (error?.response?.status === 429) {
        console.error('[Orbix Dashboard] Rate limited during setup check');
        rateLimitedRef.current = true;
        showErrorToast('Rate limit exceeded. Please wait a moment before refreshing.');
        
        // Clear rate limit after 60 seconds
        setTimeout(() => {
          rateLimitedRef.current = false;
        }, 60000);
        
        return;
      }
      
      const errorInfo = handleAPIError(error);
      if (errorInfo.redirect) {
        router.push(errorInfo.redirect);
        return;
      }
      showErrorToast(errorInfo.message || 'An error occurred');
    } finally {
      setLoading(false);
      isCheckingSetupRef.current = false;
      console.log('[Orbix Dashboard] checkSetupAndLoadData complete');
    }
  };

  const checkRenderStatus = async () => {
    if (rateLimitedRef.current) return;
    try {
      const rendersRes = await orbixNetworkAPI.getRenders({ ...apiParams(), limit: 20 });
      const newRenders = rendersRes.data.renders || [];
      const previousRenders = rendersRef.current;
      const hadActiveRenders = previousRenders.some(r =>
        (r.render_status === 'PENDING' || r.render_status === 'PROCESSING') && !isRenderStuck(r)
      );
      const hasActiveRenders = newRenders.some(r =>
        (r.render_status === 'PENDING' || r.render_status === 'PROCESSING') && !isRenderStuck(r)
      );
      const statusChanged = previousRenders.some(prev => {
        const next = newRenders.find(r => r.id === prev.id);
        return next && (next.render_status !== prev.render_status || (next.updated_at !== prev.updated_at && (next.progress !== undefined && next.progress !== prev.progress)));
      });
      setRenders(newRenders);
      serverUnreachableRef.current = false; // Backend is reachable
      if (hadActiveRenders && !hasActiveRenders) loadDashboardData();
    } catch (error) {
      if (error?.response?.status === 429) {
        rateLimitedRef.current = true;
        if (autoRefreshIntervalRef.current) {
          clearInterval(autoRefreshIntervalRef.current);
          autoRefreshIntervalRef.current = null;
        }
        setTimeout(() => { rateLimitedRef.current = false; }, 60000);
      }
    }
  };

  const refreshPipelineData = async () => {
    if (isLoadingDataRef.current || rateLimitedRef.current) return;
    try {
      const pipelineRes = await orbixNetworkAPI.getPipeline({ ...apiParams(), limit: 20 });
      setPipeline(pipelineRes.data.pipeline || []);
      serverUnreachableRef.current = false; // Backend is reachable
    } catch (error) {
      if (error?.response?.status === 429) {
        rateLimitedRef.current = true;
        setTimeout(() => { rateLimitedRef.current = false; }, 60000);
      }
      if (error?.code === 'ERR_NETWORK' || error?.message?.includes('Unable to connect')) {
        serverUnreachableRef.current = true;
        if (autoRefreshIntervalRef.current) {
          clearInterval(autoRefreshIntervalRef.current);
          autoRefreshIntervalRef.current = null;
        }
      }
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
      
      const params = apiParams();
      const [rawItemsRes, storiesRes, rendersRes, publishesRes, pipelineRes] = await Promise.all([
        orbixNetworkAPI.getRawItems({ ...params, limit: 10 }),
        orbixNetworkAPI.getStories({ ...params, limit: 10 }),
        orbixNetworkAPI.getRenders({ ...params, limit: 5 }),
        orbixNetworkAPI.getPublishes({ ...params, limit: 5 }),
        orbixNetworkAPI.getPipeline({ ...params, limit: 20 })
      ]);
      
      console.log('[Orbix Dashboard] Dashboard data fetched successfully');
      setRawItems(rawItemsRes.data.raw_items || []);
      setStories(storiesRes.data.stories || []);
      setRenders(rendersRes.data.renders || []);
      setPublishes(publishesRes.data.publishes || []);
      setPipeline(pipelineRes.data.pipeline || []);
      
      // Calculate stats
      setStats({
        totalRawItems: rawItemsRes.data.raw_items?.length || 0,
        totalStories: storiesRes.data.stories?.length || 0,
        totalRenders: rendersRes.data.renders?.length || 0,
        totalPublishes: publishesRes.data.publishes?.length || 0,
        totalViews: publishesRes.data.publishes?.reduce((sum, p) => sum + (p.views || 0), 0) || 0
      });
      
      if (rateLimitedRef.current) {
        console.log('[Orbix Dashboard] Rate limit cleared - requests successful');
        rateLimitedRef.current = false;
      }
      serverUnreachableRef.current = false; // Backend is reachable again
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
      if (error?.code === 'ERR_NETWORK' || error?.message?.includes('Unable to connect')) {
        serverUnreachableRef.current = true;
        if (autoRefreshIntervalRef.current) {
          clearInterval(autoRefreshIntervalRef.current);
          autoRefreshIntervalRef.current = null;
        }
      }
    } finally {
      setLoading(false);
      isLoadingDataRef.current = false;
      console.log('[Orbix Dashboard] loadDashboardData complete - loading flag reset');
    }
  };

  const getStepName = (step) => {
    const stepNames = {
      'PENDING': 'Waiting to start',
      'STEP_3_BACKGROUND_VOICE': 'Step 3: Background + Voice',
      'STEP_4_HOOK_TEXT': 'Step 4: Hook Text',
      'STEP_5_CAPTIONS': 'Step 5: Captions',
      'STEP_6_METADATA': 'Step 6: Metadata',
      'STEP_7_YOUTUBE_UPLOAD': 'Step 7: YouTube Upload',
      'COMPLETED': 'Completed',
      'FAILED': 'Failed'
    };
    return stepNames[step] || step || 'Unknown';
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
      const response = await orbixNetworkAPI.getRender(render.id, apiParams());
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
      await orbixNetworkAPI.deleteRender(renderId, apiParams());
      success('Render cancelled');
      setSelectedRender(null);
      setRenderDetails(null);
      loadDashboardData();
    } catch (error) {
      const errorInfo = handleAPIError(error);
      showErrorToast(errorInfo.message || 'Failed to cancel render');
    }
  };

  const stuckRenders = renders.filter(r => isRenderStuck(r));
  const handleCancelAllStuck = async () => {
    if (stuckRenders.length === 0) return;
    try {
      setCancellingStuck(true);
      for (const r of stuckRenders) {
        await orbixNetworkAPI.deleteRender(r.id);
      }
      success(`Cancelled ${stuckRenders.length} stuck render(s).`);
      await loadDashboardData();
    } catch (error) {
      const errorInfo = handleAPIError(error);
      showErrorToast(errorInfo.message || 'Failed to cancel stuck renders');
    } finally {
      setCancellingStuck(false);
    }
  };

  const handleRestartRender = async (renderId) => {
    console.log('[Orbix Dashboard] ========== RESTART RENDER START ==========');
    console.log('[Orbix Dashboard] Render ID:', renderId);
    console.log('[Orbix Dashboard] Current render details:', selectedRender);
    console.log('[Orbix Dashboard] Current time:', new Date().toISOString());
    
    try {
      console.log('[Orbix Dashboard] Calling orbixNetworkAPI.restartRender...');
      const startTime = Date.now();
      
      const response = await orbixNetworkAPI.restartRender(renderId, apiParams());
      
      const duration = Date.now() - startTime;
      console.log('[Orbix Dashboard] restartRender API call completed in', duration, 'ms');
      console.log('[Orbix Dashboard] API Response status:', response?.status);
      console.log('[Orbix Dashboard] API Response data:', response?.data);
      
      if (response?.data?.render) {
        console.log('[Orbix Dashboard] Restarted render:', {
          id: response.data.render.id,
          status: response.data.render.render_status,
          story_id: response.data.render.story_id,
          created_at: response.data.render.created_at,
          updated_at: response.data.render.updated_at
        });
      }
      
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
    console.log('[Orbix Dashboard] Current time:', new Date().toISOString());
    
    try {
      setRunningJobs(prev => ({ ...prev, [jobName]: true }));
      console.log('[Orbix Dashboard] Calling job function...');
      const startTime = Date.now();
      
      const response = await jobFunction();
      
      const duration = Date.now() - startTime;
      console.log('[Orbix Dashboard] Job function completed in', duration, 'ms');
      console.log('[Orbix Dashboard] Job response status:', response?.status);
      console.log('[Orbix Dashboard] Job response data:', response?.data);
      
      if (jobName === 'render' && response?.data) {
        console.log('[Orbix Dashboard] Render job triggered - response:', response.data);
        if (response.data.renders_created) {
          console.log('[Orbix Dashboard] Renders created:', response.data.renders_created);
        }
        if (response.data.message) {
          console.log('[Orbix Dashboard] Message:', response.data.message);
        }
      }
      
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

  const noChannel = !channelsLoading && !currentChannelId;

  return (
    <AuthGuard>
      <V2AppShell>
        <div className="p-6 space-y-6">
          {noChannel ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
              <p className="text-gray-600 mb-2">
                {channels?.length === 0
                  ? 'Create your first channel using the dropdown above to get started.'
                  : 'Select a channel from the dropdown above to view its dashboard.'}
              </p>
            </div>
          ) : (
            <>
          {/* Header */}
          <div className="flex flex-wrap justify-between items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">Orbix Network</h1>
              <p className="text-gray-600">Automated video news network</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-gray-600">Channel:</span>
              <OrbixChannelSelector />
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
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
              <button
                onClick={() => triggerJob('scrape', () => orbixNetworkAPI.triggerScrapeJob(apiBody()))}
                disabled={runningJobs.scrape}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {runningJobs.scrape ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Scraping...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Scrape
                  </>
                )}
              </button>
              
              <button
                onClick={() => triggerJob('pipeline', orbixNetworkAPI.triggerAutomatedPipeline)}
                disabled={runningJobs.pipeline}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {runningJobs.pipeline ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Full Pipeline
                  </>
                )}
              </button>
              
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
                onClick={() => triggerJob('render', orbixNetworkAPI.triggerRenderJob)}
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

          {/* Stuck renders banner - stop polling and offer cancel */}
          {stuckRenders.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                <p className="text-amber-800 text-sm">
                  <strong>{stuckRenders.length} render(s)</strong> have been in progress for over {STUCK_RENDER_MINUTES} minutes and may be stuck. Cancel them to clear the queue.
                </p>
              </div>
              <button
                onClick={handleCancelAllStuck}
                disabled={cancellingStuck}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 text-sm font-medium flex items-center gap-2"
              >
                {cancellingStuck ? <Loader className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                Cancel stuck renders
              </button>
            </div>
          )}

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

          {/* Pipeline View - Steps as Columns, Videos as Rows */}
          <PipelineView 
            pipeline={pipeline}
            onVideoClick={(item) => {
              setSelectedVideo(item);
              setIsVideoModalOpen(true);
            }}
            onRefresh={loadDashboardData}
          />

          {/* Video Detail Modal */}
          {isVideoModalOpen && (
            <VideoDetailModal
              item={selectedVideo}
              isOpen={isVideoModalOpen}
              onClose={() => {
                setIsVideoModalOpen(false);
                setSelectedVideo(null);
              }}
              onRestart={() => {
                loadDashboardData();
              }}
              onForceProcess={() => {
                loadDashboardData();
              }}
            />
          )}

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
                              <span className="text-sm text-gray-600">
                                {(renderDetails.render_step || selectedRender.render_step) 
                                  ? getStepName(renderDetails.render_step || selectedRender.render_step)
                                  : 'Progress'}
                              </span>
                              <span className="text-sm font-medium text-gray-700">
                                {(renderDetails.step_progress !== undefined || selectedRender.step_progress !== undefined)
                                  ? (renderDetails.step_progress !== undefined ? renderDetails.step_progress : selectedRender.step_progress)
                                  : (renderDetails.progress_percentage || selectedRender.progress_percentage || 0)}%
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
                                  width: `${(renderDetails.step_progress !== undefined || selectedRender.step_progress !== undefined)
                                    ? (renderDetails.step_progress !== undefined ? renderDetails.step_progress : selectedRender.step_progress)
                                    : (renderDetails.progress_percentage || selectedRender.progress_percentage || 0)}%` 
                                }}
                              />
                            </div>
                            {(renderDetails.render_status === 'PENDING' || selectedRender.render_status === 'PENDING') && 
                             ((renderDetails.step_progress === 0 || selectedRender.step_progress === 0) || 
                              (renderDetails.progress_percentage === 0 || selectedRender.progress_percentage === 0)) && (
                              <p className="text-sm text-gray-500 mt-1">Waiting to start processing...</p>
                            )}
                            {(renderDetails.render_status === 'PROCESSING' || selectedRender.render_status === 'PROCESSING') && (
                              <p className="text-sm text-gray-500 mt-1">
                                {(renderDetails.render_step || selectedRender.render_step)
                                  ? `${getStepName(renderDetails.render_step || selectedRender.render_step)} in progress...`
                                  : 'Rendering video... This may take a few minutes.'}
                              </p>
                            )}
                            {/* Step Logs */}
                            {((renderDetails.step_logs && renderDetails.step_logs.length > 0) || 
                              (selectedRender.step_logs && selectedRender.step_logs.length > 0)) && (
                              <div className="mt-4">
                                <h4 className="text-sm font-semibold text-gray-700 mb-2">Recent Activity</h4>
                                <div className="bg-gray-50 rounded p-3 max-h-40 overflow-y-auto">
                                  {(renderDetails.step_logs || selectedRender.step_logs || []).slice(-5).map((log, idx) => (
                                    <div key={idx} className="text-xs text-gray-600 mb-1">
                                      <span className="font-mono text-gray-400">
                                        {new Date(log.timestamp).toLocaleTimeString()}
                                      </span>
                                      {' '}
                                      <span className={`${
                                        log.event === 'ERROR' ? 'text-red-600' :
                                        log.event === 'COMPLETE' ? 'text-green-600' :
                                        'text-gray-700'
                                      }`}>
                                        [{log.event}] {log.message}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
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
            </>
          )}
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}

