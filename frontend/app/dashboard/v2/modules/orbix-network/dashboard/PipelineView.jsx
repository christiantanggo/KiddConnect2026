'use client';

import { useState } from 'react';
import { CheckCircle2, XCircle, Loader, Clock, Zap, ThumbsUp, RefreshCw, CheckCheck, Trash2, Upload, Square, Download } from 'lucide-react';
import { orbixNetworkAPI } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import { handleAPIError } from '@/lib/errorHandler';
import { useOrbixChannel } from '../OrbixChannelContext';

export default function PipelineView({ pipeline = [], onVideoClick, onRefresh, onForceUploadStarted }) {
  const { success, error: showErrorToast } = useToast();
  const { apiParams, channels, currentChannelId } = useOrbixChannel();
  const currentChannel = channels?.find((c) => c.id === currentChannelId);
  const scrapingStepName = currentChannel ? `${currentChannel.name} Scraping` : 'News Scraping';
  const [scoringId, setScoringId] = useState(null);
  const [allowingId, setAllowingId] = useState(null);
  const [rerenderId, setRerenderId] = useState(null);
  const [forceRenderStoryId, setForceRenderStoryId] = useState(null);
  const [approvingAllStep2, setApprovingAllStep2] = useState(false);
  const [deletingId, setDeletingId] = useState(null); // raw_item_id or story_id
  const [forceUploadId, setForceUploadId] = useState(null);
  const [cancelUploadId, setCancelUploadId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const steps = [
    { key: 'step1', name: 'News Scraping', shortName: 'Step 1' },
    { key: 'step2', name: 'Story Creation', shortName: 'Step 2' },
    { key: 'step3', name: 'Background Video', shortName: 'Step 3' },
    { key: 'step4', name: 'Voice & Music', shortName: 'Step 4' },
    { key: 'step5', name: 'Hook Text', shortName: 'Step 5' },
    { key: 'step6', name: 'Captions', shortName: 'Step 6' },
    { key: 'step7', name: 'Metadata', shortName: 'Step 7' },
    { key: 'step8', name: 'YouTube Upload', shortName: 'Step 8' },
    { key: 'completed', name: 'Completed', shortName: 'Completed' }
  ];

  const getCurrentStep = (item) => {
    // Step 1: News Scraping - show raw items (raw_item_id exists, no story_id yet)
    if (item.raw_item_id && !item.story_id) {
      return 'step1';
    }
    
    // If no story_id, skip
    if (!item.story_id) return null;
    
    // Steps 3-8: Based on render_step (check this FIRST if render exists)
    if (item.render_id && item.render_step) {
      if (item.render_step === 'STEP_3_BACKGROUND') return 'step3';
      if (item.render_step === 'STEP_4_VOICE') return 'step4';
      if (item.render_step === 'STEP_4_VOICE_MUSIC_ADDITION') return 'step4';
      if (item.render_step === 'STEP_5_HOOK_TEXT') return 'step5';
      if (item.render_step === 'STEP_6_CAPTIONS') return 'step6';
      if (item.render_step === 'STEP_7_METADATA') return 'step7';
      if (item.render_step === 'STEP_8_YOUTUBE_UPLOAD') return 'step8';
      if (item.render_step === 'COMPLETED') return 'completed';
    }
    
    // Handle failed renders
    if (item.render_id && item.render_status === 'FAILED') {
      // Determine which step failed
      if (item.render_step === 'STEP_3_BACKGROUND') return 'step3_failed';
      if (item.render_step === 'STEP_4_VOICE' || item.render_step === 'STEP_4_VOICE_MUSIC_ADDITION') return 'step4_failed';
      if (item.render_step === 'STEP_5_HOOK_TEXT') return 'step5_failed';
      if (item.render_step === 'STEP_6_CAPTIONS') return 'step6_failed';
      if (item.render_step === 'STEP_7_METADATA') return 'step7_failed';
      if (item.render_step === 'STEP_8_YOUTUBE_UPLOAD') return 'step8_failed';
      return 'step3_failed'; // Default to step 3 if unknown
    }
    
    // If render exists and is processing but step not set, assume step 3
    if (item.render_id && item.render_status === 'PROCESSING' && !item.render_step) return 'step3';
    
    // Step 2: Story Creation - current if not APPROVED and no active render
    if (!item.render_id && item.story_status !== 'APPROVED' && item.story_status !== 'RENDERED' && item.story_status !== 'PUBLISHED') {
      return item.story_status === 'REJECTED' ? 'step2_failed' : 'step2';
    }
    
    // Story approved but no render yet
    if (!item.render_id) return 'step2';
    
    return 'step2'; // Default fallback
  };

  const getStepStatus = (item) => {
    const currentStep = getCurrentStep(item);
    
    if (currentStep && currentStep.includes('_failed')) return 'failed';
    if (currentStep === 'completed') return 'completed';
    
    // Check if this item is at this specific step
    const stepNumber = currentStep?.replace('step', '') || '';
    if (stepNumber === '1') return 'completed'; // Step 1 is always completed if we have a story
    // Step 2 is completed if story is APPROVED, OR if script exists (even if status is PENDING)
    if (stepNumber === '2') {
      if (item.story_status === 'APPROVED') return 'completed';
      // If script exists, Step 2 is complete (script generation succeeded)
      if (item.script_id) return 'completed';
      return 'processing';
    }
    
    // Steps 3-8: Check render status
    if (item.render_id) {
      if (item.render_status === 'COMPLETED') return 'completed';
      if (item.render_status === 'FAILED') return 'failed';
      if (item.render_status === 'PROCESSING' || item.render_status === 'PENDING' || item.render_status === 'READY_FOR_UPLOAD') return 'processing';
    }
    
    return 'pending';
  };

  const getStatusIcon = (status) => {
    if (status === 'completed') return <CheckCircle2 className="w-5 h-5 text-green-600" />;
    if (status === 'failed') return <XCircle className="w-5 h-5 text-red-600" />;
    if (status === 'processing') return <Loader className="w-5 h-5 text-blue-600 animate-spin" />;
    return <Clock className="w-5 h-5 text-gray-400" />;
  };

  // Group items by step
  const videosByStep = pipeline.reduce((acc, item) => {
    const step = getCurrentStep(item);
    if (step) {
      // Remove _failed suffix for grouping
      const stepKey = step.replace('_failed', '');
      if (!acc[stepKey]) acc[stepKey] = [];
      acc[stepKey].push(item);
    }
    return acc;
  }, {});

  if (!pipeline || pipeline.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center">
        <p className="text-gray-500">No pipeline data yet. Stories will appear here as they progress through the pipeline.</p>
        <p className="text-gray-400 text-sm mt-2">If you just ran Scrape: select a channel above first, then run Scrape again so items are saved to that channel and show here.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <h2 className="text-xl font-semibold">Video Pipeline</h2>
        <p className="text-sm text-gray-600 mt-1">Track each video as it moves through the production steps</p>
      </div>
      
      <div className="divide-y divide-gray-200">
        {steps.map((step) => {
          const videos = videosByStep[step.key] || [];
          const hasVideos = videos.length > 0;
          const isScrapingStep = step.key === 'step1';

          return (
            <div key={step.key} className="p-6">
              {/* Step Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold">{step.key === 'step1' ? scrapingStepName : step.name}</h3>
                  {hasVideos && (
                    <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                      {videos.length} {videos.length === 1 ? 'video' : 'videos'}
                    </span>
                  )}
                </div>
                {isScrapingStep && (
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (approvingAllStep2) return;
                      setApprovingAllStep2(true);
                      try {
                        const res = await orbixNetworkAPI.allowAllRawItems(apiParams());
                        const allowed = res.data?.allowed ?? 0;
                        const approved = res.data?.approved ?? 0;
                        if (allowed > 0 || approved > 0) {
                          const parts = [];
                          if (allowed > 0) parts.push(`${allowed} allowed as story${allowed !== 1 ? 'ies' : ''}`);
                          if (approved > 0) parts.push(`${approved} approved`);
                          success(parts.join('. ') + '. The system will now run.');
                          if (typeof onRefresh === 'function') onRefresh();
                        } else {
                          showErrorToast('No discarded items or pending stories for this channel.');
                        }
                      } catch (err) {
                        const info = handleAPIError(err);
                        showErrorToast(info.message || 'Failed to allow/approve all');
                      } finally {
                        setApprovingAllStep2(false);
                      }
                    }}
                    disabled={approvingAllStep2}
                    className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {approvingAllStep2 ? <Loader className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
                    {approvingAllStep2 ? 'Allow & approve…' : 'Approve All'}
                  </button>
                )}
              </div>
              
              {/* Videos in this step */}
              {hasVideos ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {videos.map((item, index) => {
                    const status = getStepStatus(item);
                    // Avoid showing step number (e.g. 8) as progress: 1-9 when on step 8 is likely step index, not 0-100
                    let progress = item.step_progress ?? 0;
                    if (item.render_step === 'STEP_8_YOUTUBE_UPLOAD' && progress >= 1 && progress <= 9) progress = 0;
                    const hasScore = (item.story_shock_score ?? item.shock_score) != null;
                    const isStep1Unscored = step.key === 'step1' && item.raw_item_id && !hasScore;
                    const isStep1Rejected = step.key === 'step1' && item.rejected && item.raw_item_id;
                    const isScoring = scoringId === item.raw_item_id;
                    const isAllowing = allowingId === item.raw_item_id;

                    return (
                      <div
                        key={item.story_id || item.raw_item_id || `step-${step.key}-item-${index}`}
                        className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => onVideoClick && onVideoClick(item)}
                      >
                        <div className="flex flex-col">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <p className="font-medium text-sm line-clamp-2 flex-1">{item.story_title}</p>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const toDelete = item.raw_item_id && !item.story_id ? 'raw' : 'story';
                                  if (!confirm(`Delete this ${toDelete === 'raw' ? 'scraped item' : 'story'}? It will be removed from the pipeline.`)) return;
                                  setDeletingId(toDelete === 'raw' ? item.raw_item_id : item.story_id);
                                  try {
                                    if (toDelete === 'raw') {
                                      await orbixNetworkAPI.deleteRawItem(item.raw_item_id, apiParams());
                                      success('Scraped item deleted');
                                    } else {
                                      await orbixNetworkAPI.deleteStory(item.story_id, apiParams());
                                      success('Story deleted');
                                    }
                                    if (typeof onRefresh === 'function') onRefresh();
                                  } catch (err) {
                                    const info = handleAPIError(err);
                                    showErrorToast(info.message || 'Delete failed');
                                  } finally {
                                    setDeletingId(null);
                                  }
                                }}
                                disabled={!!deletingId}
                                className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
                                title={item.raw_item_id && !item.story_id ? 'Delete scraped item' : 'Delete story'}
                              >
                                {deletingId === (item.raw_item_id && !item.story_id ? item.raw_item_id : item.story_id) ? (
                                  <Loader className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Trash2 className="w-4 h-4" />
                                )}
                              </button>
                              {getStatusIcon(status)}
                            </div>
                          </div>
                          
                          <div className="flex gap-2 mb-2 flex-wrap">
                            {item.rejected && (
                              <span className="px-2 py-0.5 text-xs bg-red-100 text-red-800 rounded font-medium" title={item.discard_reason || ''}>
                                Rejected
                              </span>
                            )}
                            <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-800 rounded font-semibold">
                              Score: {(item.story_shock_score ?? item.shock_score) != null ? (item.story_shock_score ?? item.shock_score) : '—'}
                            </span>
                            {item.story_category && (
                              <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded">
                                {item.story_category}
                              </span>
                            )}
                          </div>

                          {isStep1Rejected && (
                            <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                              {!hasScore && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (!item.raw_item_id) return;
                                    setScoringId(item.raw_item_id);
                                    try {
                                      const res = await orbixNetworkAPI.forceScoreRawItem(item.raw_item_id, apiParams());
                                      success(res.data?.message || 'Score updated');
                                      if (typeof onRefresh === 'function') onRefresh();
                                    } catch (err) {
                                      const info = handleAPIError(err);
                                      showErrorToast(info.message || 'Failed to score');
                                    } finally {
                                      setScoringId(null);
                                    }
                                  }}
                                  disabled={isScoring}
                                  className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 disabled:opacity-50"
                                >
                                  {isScoring ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                                  {isScoring ? 'Scoring…' : 'Force score'}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!item.raw_item_id) return;
                                  setAllowingId(item.raw_item_id);
                                  try {
                                    const res = await orbixNetworkAPI.allowStoryRawItem(item.raw_item_id, apiParams());
                                    success(res.data?.message || 'Story added to pipeline');
                                    if (typeof onRefresh === 'function') onRefresh();
                                  } catch (err) {
                                    const info = handleAPIError(err);
                                    showErrorToast(info.message || 'Failed to allow story');
                                  } finally {
                                    setAllowingId(null);
                                  }
                                }}
                                disabled={isAllowing}
                                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium bg-emerald-100 text-emerald-800 rounded-lg hover:bg-emerald-200 disabled:opacity-50"
                              >
                                {isAllowing ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <ThumbsUp className="w-3.5 h-3.5" />}
                                {isAllowing ? 'Adding…' : 'Allow story'}
                              </button>
                            </div>
                          )}

                          {isStep1Unscored && !item.rejected && (
                            <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!item.raw_item_id) return;
                                  setScoringId(item.raw_item_id);
                                  try {
                                    const res = await orbixNetworkAPI.forceScoreRawItem(item.raw_item_id, apiParams());
                                    success(res.data?.message || 'Score updated');
                                    if (typeof onRefresh === 'function') onRefresh();
                                  } catch (err) {
                                    const info = handleAPIError(err);
                                    showErrorToast(info.message || 'Failed to score');
                                  } finally {
                                    setScoringId(null);
                                  }
                                }}
                                disabled={isScoring}
                                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 disabled:opacity-50"
                              >
                                {isScoring ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                                {isScoring ? 'Scoring…' : 'Force score'}
                              </button>
                            </div>
                          )}
                          
                          {item.render_id && (
                            <div className="mt-2 pt-2 border-t border-gray-100">
                              <div className="flex items-center justify-between text-xs text-gray-600">
                                <span>Progress</span>
                                <span className="font-medium">{progress}%</span>
                              </div>
                              {progress > 0 && progress < 100 && (
                                <div className="mt-1 w-full bg-gray-200 rounded-full h-1.5">
                                  <div 
                                    className="bg-blue-600 h-1.5 rounded-full transition-all"
                                    style={{ width: `${progress}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          )}

                          {/* Step 2: Story Creation - force start render pipeline when no render yet */}
                          {step.key === 'step2' && item.story_id && !item.render_id && (
                            <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!item.story_id) return;
                                  setForceRenderStoryId(item.story_id);
                                  try {
                                    await orbixNetworkAPI.forceRenderStory(item.story_id, apiParams());
                                    success('Render pipeline started');
                                    if (typeof onRefresh === 'function') onRefresh();
                                  } catch (err) {
                                    const info = handleAPIError(err);
                                    showErrorToast(info.message || 'Failed to force render');
                                  } finally {
                                    setForceRenderStoryId(null);
                                  }
                                }}
                                disabled={forceRenderStoryId === item.story_id}
                                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium bg-blue-100 text-blue-800 rounded-lg hover:bg-blue-200 disabled:opacity-50"
                              >
                                {forceRenderStoryId === item.story_id ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                                {forceRenderStoryId === item.story_id ? 'Starting…' : 'Force Render'}
                              </button>
                            </div>
                          )}

                          {step.key === 'completed' && item.render_id && (
                            <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!item.render_id) return;
                                  setRerenderId(item.render_id);
                                  try {
                                    await orbixNetworkAPI.restartRender(item.render_id, apiParams(), item.story_id);
                                    success('Re-render started');
                                    if (typeof onRefresh === 'function') onRefresh();
                                  } catch (err) {
                                    const info = handleAPIError(err);
                                    showErrorToast(info.message || 'Re-render failed');
                                  } finally {
                                    setRerenderId(null);
                                  }
                                }}
                                disabled={rerenderId === item.render_id}
                                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium bg-blue-100 text-blue-800 rounded-lg hover:bg-blue-200 disabled:opacity-50"
                              >
                                {rerenderId === item.render_id ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                {rerenderId === item.render_id ? 'Starting…' : 'Re-Render'}
                              </button>
                            </div>
                          )}

                          {/* Step 8: YouTube Upload - Force upload (retry) and Cancel upload */}
                          {step.key === 'step8' && item.render_id && (
                            <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                              {(() => {
                                const atStep8 = item.render_step === 'STEP_8_YOUTUBE_UPLOAD';
                                const canForceUpload = ['READY_FOR_UPLOAD', 'STEP_FAILED', 'UPLOAD_FAILED', 'COMPLETED'].includes(item.render_status) || (item.render_status === 'PROCESSING' && atStep8);
                                const canCancelUpload = item.render_status === 'PROCESSING' && atStep8;
                                return (
                                  <>
                                    {canCancelUpload && (
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          if (!item.render_id) return;
                                          setCancelUploadId(item.render_id);
                                          try {
                                            await orbixNetworkAPI.resetUploadState(item.render_id, apiParams());
                                            success('Upload cancelled. You can retry when ready.');
                                            if (typeof onRefresh === 'function') onRefresh();
                                          } catch (err) {
                                            const info = handleAPIError(err);
                                            showErrorToast(info.message || 'Cancel upload failed');
                                          } finally {
                                            setCancelUploadId(null);
                                          }
                                        }}
                                        disabled={cancelUploadId === item.render_id}
                                        className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 disabled:opacity-50"
                                      >
                                        {cancelUploadId === item.render_id ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}
                                        {cancelUploadId === item.render_id ? 'Cancelling…' : 'Cancel upload'}
                                      </button>
                                    )}
                                    {canForceUpload && (
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          if (!item.render_id) return;
                                          setForceUploadId(item.render_id);
                                          try {
                                            await orbixNetworkAPI.uploadRenderToYoutube(item.render_id, apiParams());
                                            success('Upload started — opening video to show status when complete.');
                                            if (typeof onRefresh === 'function') onRefresh();
                                            if (typeof onForceUploadStarted === 'function') onForceUploadStarted(item);
                                          } catch (err) {
                                            const info = handleAPIError(err);
                                            showErrorToast(info.message || 'Upload failed');
                                          } finally {
                                            setForceUploadId(null);
                                          }
                                        }}
                                        disabled={forceUploadId === item.render_id}
                                        className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium bg-blue-100 text-blue-800 rounded-lg hover:bg-blue-200 disabled:opacity-50"
                                      >
                                        {forceUploadId === item.render_id ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                                        {forceUploadId === item.render_id ? 'Uploading…' : 'Force upload'}
                                      </button>
                                    )}
                                    {canForceUpload && (
                                      <button
                                        type="button"
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          if (!item.render_id) return;
                                          setDownloadingId(item.render_id);
                                          try {
                                            const res = await orbixNetworkAPI.downloadVideo(item.render_id, apiParams());
                                            const url = URL.createObjectURL(res.data);
                                            const a = document.createElement('a');
                                            a.href = url;
                                            a.download = `orbix-video-${item.render_id}.mp4`;
                                            document.body.appendChild(a);
                                            a.click();
                                            document.body.removeChild(a);
                                            URL.revokeObjectURL(url);
                                            success('Video downloaded');
                                          } catch (err) {
                                            const info = handleAPIError(err);
                                            showErrorToast(info.message || 'Download failed');
                                          } finally {
                                            setDownloadingId(null);
                                          }
                                        }}
                                        disabled={downloadingId === item.render_id}
                                        className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium bg-slate-700 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50"
                                      >
                                        {downloadingId === item.render_id ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                        {downloadingId === item.render_id ? 'Downloading…' : 'Download video'}
                                      </button>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">No videos in this step</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
