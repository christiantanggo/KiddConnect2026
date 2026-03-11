'use client';

import { useState } from 'react';
import { CheckCircle2, XCircle, Loader, Clock, Zap, ThumbsUp, RefreshCw, CheckCheck, Trash2, Upload, Square, Download, FileText, Film, Youtube } from 'lucide-react';
import { orbixNetworkAPI } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import { handleAPIError } from '@/lib/errorHandler';
import { useOrbixChannel } from '../OrbixChannelContext';

const RENDER_STEP_LABELS = {
  STEP_3_BACKGROUND: 'Background video',
  STEP_4_VOICE: 'Voice & music',
  STEP_4_VOICE_MUSIC_ADDITION: 'Voice & music',
  STEP_5_HOOK_TEXT: 'Hook text',
  STEP_6_CAPTIONS: 'Captions',
  STEP_7_METADATA: 'Metadata',
  STEP_8_YOUTUBE_UPLOAD: 'YouTube upload',
  COMPLETED: 'Complete',
  DADJOKE_RENDER: 'Dad joke video',
  TRIVIA_RENDER: 'Trivia video',
  TRICKQUESTION_RENDER: 'Trick question video',
  RIDDLE_RENDER: 'Riddle video',
  MINDTEASER_RENDER: 'Mind teaser video',
  FACTS_RENDER: 'Facts video'
};

function getStageLabel(renderStep) {
  return RENDER_STEP_LABELS[renderStep] || (renderStep ? String(renderStep).replace(/^STEP_\d+_/, '').replace(/_/g, ' ') : 'Starting…');
}

export default function PipelineView({ pipeline = [], publishes = [], onVideoClick, onRefresh, onForceUploadStarted }) {
  const { success, error: showErrorToast } = useToast();
  const { apiParams, channels, currentChannelId } = useOrbixChannel();
  const currentChannel = channels?.find((c) => c.id === currentChannelId);
  const scrapingStepName = currentChannel ? `${currentChannel.name} Scraping` : 'News Scraping';
  const [scoringId, setScoringId] = useState(null);
  const [allowingId, setAllowingId] = useState(null);
  const [forceRenderStoryId, setForceRenderStoryId] = useState(null);
  const [approvingAllStory, setApprovingAllStory] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [forceUploadId, setForceUploadId] = useState(null);
  const [cancelUploadId, setCancelUploadId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  // Render IDs that are already uploaded (in publishes) — show those only in Uploaded section.
  const publishedRenderIds = new Set((publishes || []).map((p) => p.render_id).filter(Boolean));

  // Bucket pipeline into Story vs Render. Uploaded = publishes.
  const storyItems = [];
  const renderItems = [];
  for (const item of pipeline) {
    const isRaw = item.raw_item_id && !item.story_id;
    const hasRender = !!item.render_id;
    const renderFailed = item.render_status === 'FAILED';
    const alreadyUploaded = hasRender && publishedRenderIds.has(item.render_id);
    const renderActive = hasRender && !alreadyUploaded && ['PENDING', 'PROCESSING', 'READY_FOR_UPLOAD', 'COMPLETED'].includes(item.render_status);

    if (isRaw || (item.story_id && !hasRender) || (item.story_id && renderFailed)) {
      storyItems.push(item);
    } else if (item.story_id && renderActive) {
      renderItems.push(item);
    }
    // Items that are already uploaded (in publishes) are not added to storyItems or renderItems; they only appear in Uploaded section.
  }

  const activeRenderItem = renderItems.find(
    (r) => r.render_status === 'PENDING' || r.render_status === 'PROCESSING' || r.render_status === 'READY_FOR_UPLOAD'
  ) || renderItems.find((r) => r.render_status === 'COMPLETED');
  const progressPercent = activeRenderItem?.step_progress != null ? Math.min(100, Math.max(0, Number(activeRenderItem.step_progress))) : 0;
  const progressLabel = activeRenderItem ? getStageLabel(activeRenderItem.render_step) : '';
  const latestLogMessage = activeRenderItem?.step_logs?.length > 0
    ? activeRenderItem.step_logs[activeRenderItem.step_logs.length - 1]?.message
    : null;

  const canForceUpload = (item) => {
    if (!item.render_id) return false;
    const s = item.render_status;
    const atStep8 = item.render_step === 'STEP_8_YOUTUBE_UPLOAD';
    return ['READY_FOR_UPLOAD', 'STEP_FAILED', 'UPLOAD_FAILED', 'COMPLETED'].includes(s) || (s === 'PROCESSING' && atStep8);
  };
  const canCancelUpload = (item) => item.render_id && item.render_status === 'PROCESSING' && item.render_step === 'STEP_8_YOUTUBE_UPLOAD';

  if (!pipeline?.length && !publishes?.length) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center">
        <p className="text-gray-500">No pipeline data yet. Stories will appear here as they progress.</p>
        <p className="text-gray-400 text-sm mt-2">Select a channel above, then run Scrape so items show here.</p>
      </div>
    );
  }

  const renderCard = (item, options = {}) => {
    const isRaw = item.raw_item_id && !item.story_id;
    const hasScore = (item.story_shock_score ?? item.shock_score) != null;
    const isRejected = item.rejected && item.raw_item_id;
    const isUnscored = isRaw && !hasScore && !isRejected;
    const showForceRender = item.story_id && !item.render_id;
    const showUploadNow = options.inRenderSection && canForceUpload(item);
    const showCancelUpload = options.inRenderSection && canCancelUpload(item);
    const showDownload = options.inRenderSection && item.render_id && (item.render_status === 'READY_FOR_UPLOAD' || item.render_status === 'COMPLETED');

    return (
      <div
        key={item.story_id || item.raw_item_id || item.id}
        className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer bg-white"
        onClick={() => onVideoClick && onVideoClick(item)}
      >
        <div className="flex flex-col">
          <div className="flex items-start justify-between gap-2 mb-2">
            <p className="font-medium text-sm line-clamp-2 flex-1">{item.story_title || item.title}</p>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={async (e) => {
                  e.stopPropagation();
                  const toDelete = isRaw ? 'raw' : 'story';
                  if (!confirm(`Delete this ${toDelete === 'raw' ? 'scraped item' : 'story'}?`)) return;
                  setDeletingId(isRaw ? item.raw_item_id : item.story_id);
                  try {
                    if (isRaw) {
                      await orbixNetworkAPI.deleteRawItem(item.raw_item_id, apiParams());
                      success('Scraped item deleted');
                    } else {
                      await orbixNetworkAPI.deleteStory(item.story_id, apiParams());
                      success('Story deleted');
                    }
                    if (typeof onRefresh === 'function') onRefresh();
                  } catch (err) {
                    showErrorToast(handleAPIError(err).message || 'Delete failed');
                  } finally {
                    setDeletingId(null);
                  }
                }}
                disabled={!!deletingId}
                className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
                title={isRaw ? 'Delete scraped item' : 'Delete story'}
              >
                {deletingId === (isRaw ? item.raw_item_id : item.story_id) ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
          <div className="flex gap-2 mb-2 flex-wrap">
            {item.rejected && (
              <span className="px-2 py-0.5 text-xs bg-red-100 text-red-800 rounded font-medium" title={item.discard_reason || ''}>
                Rejected
              </span>
            )}
            {(item.story_shock_score != null || item.shock_score != null) && (
              <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-800 rounded font-semibold">
                Score: {item.story_shock_score ?? item.shock_score}
              </span>
            )}
            {item.story_category && (
              <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded">{item.story_category}</span>
            )}
          </div>

          {/* Story section: raw item actions */}
          {options.section === 'story' && isRejected && (
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
                      showErrorToast(handleAPIError(err).message || 'Failed to score');
                    } finally {
                      setScoringId(null);
                    }
                  }}
                  disabled={scoringId === item.raw_item_id}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 disabled:opacity-50"
                >
                  {scoringId === item.raw_item_id ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                  {scoringId === item.raw_item_id ? 'Scoring…' : 'Force score'}
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
                    showErrorToast(handleAPIError(err).message || 'Failed to allow story');
                  } finally {
                    setAllowingId(null);
                  }
                }}
                disabled={allowingId === item.raw_item_id}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium bg-emerald-100 text-emerald-800 rounded-lg hover:bg-emerald-200 disabled:opacity-50"
              >
                {allowingId === item.raw_item_id ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <ThumbsUp className="w-3.5 h-3.5" />}
                {allowingId === item.raw_item_id ? 'Adding…' : 'Allow story'}
              </button>
            </div>
          )}
          {options.section === 'story' && isUnscored && !isRejected && (
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
                    showErrorToast(handleAPIError(err).message || 'Failed to score');
                  } finally {
                    setScoringId(null);
                  }
                }}
                disabled={scoringId === item.raw_item_id}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 disabled:opacity-50"
              >
                {scoringId === item.raw_item_id ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                {scoringId === item.raw_item_id ? 'Scoring…' : 'Force score'}
              </button>
            </div>
          )}
          {options.section === 'story' && showForceRender && (
            <div className="mt-2" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={async () => {
                  if (!item.story_id) return;
                  setForceRenderStoryId(item.story_id);
                  try {
                    await orbixNetworkAPI.forceRenderStory(item.story_id, apiParams());
                    success('Render started');
                    if (typeof onRefresh === 'function') onRefresh();
                  } catch (err) {
                    showErrorToast(handleAPIError(err).message || 'Failed to start render');
                  } finally {
                    setForceRenderStoryId(null);
                  }
                }}
                disabled={forceRenderStoryId === item.story_id}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium bg-blue-100 text-blue-800 rounded-lg hover:bg-blue-200 disabled:opacity-50"
              >
                {forceRenderStoryId === item.story_id ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                {forceRenderStoryId === item.story_id ? 'Starting…' : 'Start render'}
              </button>
            </div>
          )}

          {/* Render section: progress, Upload Now, Download, Cancel */}
          {options.inRenderSection && item.render_id && (
            <div className="mt-2 pt-2 border-t border-gray-100 space-y-2" onClick={(e) => e.stopPropagation()}>
              {['PENDING', 'PROCESSING'].includes(item.render_status) && (
                <div className="text-xs text-gray-600">
                  <span>{getStageLabel(item.render_step)}</span>
                  <span className="ml-2 font-medium">{(item.step_progress ?? 0)}%</span>
                </div>
              )}
              {showCancelUpload && (
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
                      showErrorToast(handleAPIError(err).message || 'Cancel failed');
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
              {showUploadNow && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!item.render_id) return;
                    setForceUploadId(item.render_id);
                    try {
                      await orbixNetworkAPI.uploadRenderToYoutube(item.render_id, apiParams());
                      success('Upload started.');
                      if (typeof onRefresh === 'function') onRefresh();
                      if (typeof onForceUploadStarted === 'function') onForceUploadStarted(item);
                    } catch (err) {
                      showErrorToast(handleAPIError(err).message || 'Upload failed');
                    } finally {
                      setForceUploadId(null);
                    }
                  }}
                  disabled={forceUploadId === item.render_id}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {forceUploadId === item.render_id ? <Loader className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {forceUploadId === item.render_id ? 'Uploading…' : 'Upload Now'}
                </button>
              )}
              {showDownload && (
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
                      showErrorToast(handleAPIError(err).message || 'Download failed');
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
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <h2 className="text-xl font-semibold">Video Pipeline</h2>
        <p className="text-sm text-gray-600 mt-1">Stories → Render → Uploaded</p>
      </div>

      {/* Section 1: Story */}
      <section className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            Story
          </h3>
          {storyItems.length > 0 && (
            <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
              {storyItems.length} {storyItems.length === 1 ? 'item' : 'items'}
            </span>
          )}
          {storyItems.some((i) => i.raw_item_id && !i.story_id) && (
            <button
              type="button"
              onClick={async () => {
                if (approvingAllStory) return;
                setApprovingAllStory(true);
                try {
                  const res = await orbixNetworkAPI.allowAllRawItems(apiParams());
                  const allowed = res.data?.allowed ?? 0;
                  const approved = res.data?.approved ?? 0;
                  if (allowed > 0 || approved > 0) {
                    const parts = [];
                    if (allowed > 0) parts.push(`${allowed} allowed`);
                    if (approved > 0) parts.push(`${approved} approved`);
                    success(parts.join('. '));
                    if (typeof onRefresh === 'function') onRefresh();
                  } else {
                    showErrorToast('No discarded items or pending stories for this channel.');
                  }
                } catch (err) {
                  showErrorToast(handleAPIError(err).message || 'Failed to allow/approve all');
                } finally {
                  setApprovingAllStory(false);
                }
              }}
              disabled={approvingAllStory}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60"
            >
              {approvingAllStory ? <Loader className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
              Approve All
            </button>
          )}
        </div>
        <p className="text-sm text-gray-500 mb-4">Scraped content ready to read. Open a card to view; start render when ready.</p>
        {storyItems.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No stories here yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {storyItems.map((item) => renderCard(item, { section: 'story' }))}
          </div>
        )}
      </section>

      {/* Section 2: Render */}
      <section className="p-6 border-b border-gray-200 bg-gray-50/50">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Film className="w-5 h-5 text-amber-600" />
            Render
          </h3>
          {renderItems.length > 0 && (
            <span className="px-2 py-1 text-xs bg-amber-100 text-amber-800 rounded-full">
              {renderItems.length} {renderItems.length === 1 ? 'video' : 'videos'}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 mb-4">Videos building or ready to upload. Use &quot;Upload Now&quot; when the render is complete.</p>
        {renderItems.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No videos rendering.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
              {renderItems.map((item) => renderCard(item, { inRenderSection: true }))}
            </div>
            {/* Single progress bar at bottom of Render section */}
            {activeRenderItem && (activeRenderItem.render_status === 'PENDING' || activeRenderItem.render_status === 'PROCESSING') && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between text-sm text-gray-700 mb-2">
                  <span className="font-medium">{progressLabel}</span>
                  <span>{progressPercent}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className="bg-amber-500 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                {latestLogMessage && (
                  <p className="text-xs text-gray-500 mt-2 truncate" title={latestLogMessage}>
                    {latestLogMessage}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </section>

      {/* Section 3: Uploaded */}
      <section className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Youtube className="w-5 h-5 text-red-600" />
            Uploaded
          </h3>
          {publishes.length > 0 && (
            <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
              {publishes.length} {publishes.length === 1 ? 'video' : 'videos'}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 mb-4">Videos that have been uploaded to YouTube.</p>
        {!publishes || publishes.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No uploads yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {publishes.map((p) => {
              const render = Array.isArray(p.orbix_renders) ? p.orbix_renders[0] : p.orbix_renders;
              const story = render?.orbix_stories;
              const storyTitle = story?.title?.trim() || p.title?.trim() || 'Untitled';
              const category = story?.category;
              const descriptionSnippet = p.description ? String(p.description).replace(/\n/g, ' ').trim().slice(0, 120) : null;
              return (
                <div
                  key={p.id}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow bg-white"
                >
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <span className="px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded font-medium shrink-0">
                      {p.publish_status === 'PUBLISHED' ? 'Published' : p.publish_status || 'Uploaded'}
                    </span>
                  </div>
                  <h4 className="font-medium text-sm line-clamp-2 mb-2" title={storyTitle}>
                    {storyTitle}
                  </h4>
                  <div className="flex gap-2 mb-2 flex-wrap">
                    {category && (
                      <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded">
                        {category}
                      </span>
                    )}
                  </div>
                  {descriptionSnippet && (
                    <p className="text-xs text-gray-500 line-clamp-2 mb-2" title={p.description}>
                      {descriptionSnippet}{descriptionSnippet.length >= 120 ? '…' : ''}
                    </p>
                  )}
                  {p.platform_video_id && (
                    <a
                      href={`https://www.youtube.com/watch?v=${p.platform_video_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-red-600 hover:text-red-700 font-medium inline-flex items-center gap-1"
                    >
                      <Youtube className="w-4 h-4" />
                      Watch on YouTube
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
