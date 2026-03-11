'use client';
// Orbix Long-form: puzzle library (non–Dad Joke channels) or Dad Joke story-then-punchline long-form (Dad Jokes channel only)

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import { orbixNetworkAPI } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import { handleAPIError } from '@/lib/errorHandler';
import { Loader, Film, ListChecks, Plus, Check, X, Sparkles, FileText, Image as ImageIcon, ChevronRight, Upload } from 'lucide-react';
import { useOrbixChannel } from '../OrbixChannelContext';

const LONGFORM_SEGMENT_KEYS = ['cold_open', 'act_1_setup', 'act_2_escalation', 'act_3_chaos', 'final_reset'];

export default function OrbixLongformPage() {
  const { success, error: showErrorToast } = useToast();
  const { currentChannelId, apiParams, apiBody } = useOrbixChannel();
  const [loading, setLoading] = useState(true);
  const [puzzles, setPuzzles] = useState([]);
  const [videos, setVideos] = useState([]);
  const [usedFilter, setUsedFilter] = useState(''); // '' | 'true' | 'false'
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createSubtitle, setCreateSubtitle] = useState('');
  const [createHook, setCreateHook] = useState('');
  const [selectedPuzzleIds, setSelectedPuzzleIds] = useState([]);
  const [isDadJokeChannel, setIsDadJokeChannel] = useState(false);
  // Dad joke long-form state
  const [dadjokeJokes, setDadjokeJokes] = useState([]);
  const [selectedJokeStoryId, setSelectedJokeStoryId] = useState(null);
  const [generatingScript, setGeneratingScript] = useState(false);
  const [generatedScript, setGeneratedScript] = useState(null);
  const [creatingDadjoke, setCreatingDadjoke] = useState(false);
  const [showDadjokeCreateForm, setShowDadjokeCreateForm] = useState(false);
  const [renderingId, setRenderingId] = useState(null);
  const [showFullScriptModal, setShowFullScriptModal] = useState(false);
  const [selectedVideoDetailId, setSelectedVideoDetailId] = useState(null);
  const [videoDetail, setVideoDetail] = useState(null);
  const [videoDetailLoading, setVideoDetailLoading] = useState(false);
  const [generatingBackgroundId, setGeneratingBackgroundId] = useState(null);
  const [uploadingSegmentKey, setUploadingSegmentKey] = useState(null);
  const [resettingRenderId, setResettingRenderId] = useState(null);

  useEffect(() => {
    if (!currentChannelId) {
      setLoading(false);
      setPuzzles([]);
      setVideos([]);
      setIsDadJokeChannel(false);
      setDadjokeJokes([]);
      return;
    }
    loadData();
  }, [currentChannelId, usedFilter]);

  useEffect(() => {
    if (!selectedVideoDetailId || !isDadJokeChannel) {
      setVideoDetail(null);
      return;
    }
    let cancelled = false;
    setVideoDetailLoading(true);
    setVideoDetail(null);
    orbixNetworkAPI.getLongformVideo(selectedVideoDetailId, apiParams())
      .then((res) => {
        if (!cancelled) {
          setVideoDetail(res.data);
        }
      })
      .catch(() => {
        if (!cancelled) setVideoDetail(null);
      })
      .finally(() => {
        if (!cancelled) setVideoDetailLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedVideoDetailId, isDadJokeChannel, currentChannelId]);

  // Poll video detail when render is in progress (RENDERING or PROCESSING)
  useEffect(() => {
    const status = videoDetail?.render_status;
    if (!selectedVideoDetailId || !isDadJokeChannel || (status !== 'RENDERING' && status !== 'PROCESSING')) return;
    const interval = setInterval(() => {
      orbixNetworkAPI.getLongformVideo(selectedVideoDetailId, apiParams())
        .then((res) => {
          const data = res.data;
          setVideoDetail(data);
          if (data?.render_status === 'COMPLETED') {
            success('Render finished. Video is ready.');
            loadData();
          } else if (data?.render_status === 'FAILED') {
            showErrorToast('Render failed. Check the video and try again.');
            loadData();
          }
        })
        .catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, [selectedVideoDetailId, isDadJokeChannel, videoDetail?.render_status]);

  const loadData = async () => {
    try {
      setLoading(true);
      const params = { ...apiParams() };
      if (usedFilter) params.used_in_longform = usedFilter;
      const [puzzlesRes, videosRes, sourcesRes] = await Promise.all([
        orbixNetworkAPI.getLongformPuzzles(params),
        orbixNetworkAPI.getLongformVideos(apiParams()),
        orbixNetworkAPI.getSources(params),
      ]);
      setPuzzles(puzzlesRes.data?.puzzles ?? []);
      setVideos(videosRes.data?.videos ?? []);
      const sources = sourcesRes.data?.sources ?? [];
      const isDad = sources.some((s) => s.type === 'DAD_JOKE_GENERATOR');
      setIsDadJokeChannel(isDad);
      if (isDad) {
        try {
          const jokesRes = await orbixNetworkAPI.getLongformDadjokeJokes(apiParams());
          setDadjokeJokes(jokesRes.data?.jokes ?? []);
        } catch {
          setDadjokeJokes([]);
        }
      } else {
        setDadjokeJokes([]);
      }
    } catch (err) {
      console.error('Longform load error:', err);
      showErrorToast(handleAPIError(err).message || 'Failed to load long-form data');
      setPuzzles([]);
      setVideos([]);
    } finally {
      setLoading(false);
    }
  };

  const togglePuzzleSelection = (id) => {
    setSelectedPuzzleIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleCreateVideo = async () => {
    if (!selectedPuzzleIds.length) {
      showErrorToast('Select at least one puzzle.');
      return;
    }
    try {
      setCreating(true);
      await orbixNetworkAPI.createLongformVideo({
        ...apiBody(),
        title: createTitle.trim() || null,
        subtitle: createSubtitle.trim() || null,
        hook_text: createHook.trim() || null,
        puzzle_ids: selectedPuzzleIds,
      });
      success('Long-form video record created. Render and thumbnail will be added in a future update.');
      setShowCreateForm(false);
      setCreateTitle('');
      setCreateSubtitle('');
      setCreateHook('');
      setSelectedPuzzleIds([]);
      loadData();
    } catch (err) {
      showErrorToast(handleAPIError(err).message || 'Failed to create long-form video');
    } finally {
      setCreating(false);
    }
  };

  const handleGenerateDadjokeScript = async () => {
    if (!selectedJokeStoryId) {
      showErrorToast('Select a dad joke (from your shorts) to build the story around.');
      return;
    }
    try {
      setGeneratingScript(true);
      setGeneratedScript(null);
      const res = await orbixNetworkAPI.generateLongformDadjokeScript({
        ...apiBody(),
        story_id: selectedJokeStoryId,
      });
      setGeneratedScript(res.data);
      success('Script generated. Review and create the video record below.');
    } catch (err) {
      showErrorToast(handleAPIError(err).message || 'Failed to generate script');
    } finally {
      setGeneratingScript(false);
    }
  };

  const handleCreateDadjokeVideo = async () => {
    if (!selectedJokeStoryId) {
      showErrorToast('Select a dad joke first.');
      return;
    }
    const scriptJson = generatedScript
      ? {
          title: generatedScript.title,
          thumbnail_text_suggestions: generatedScript.thumbnail_text_suggestions,
          full_script: generatedScript.full_script,
          segment_markers: generatedScript.segment_markers,
          visual_suggestions: generatedScript.visual_suggestions,
          final_joke: generatedScript.final_joke,
          joke_metadata: generatedScript.joke_metadata,
          estimated_duration_seconds: generatedScript.estimated_duration_seconds,
          dad_activity: generatedScript.dad_activity,
        }
      : undefined;
    try {
      setCreatingDadjoke(true);
      await orbixNetworkAPI.createLongformDadjokeVideo({
        ...apiBody(),
        story_id: selectedJokeStoryId,
        title: generatedScript?.title?.trim() || null,
        subtitle: createSubtitle.trim() || null,
        hook_text: createHook.trim() || null,
        script_json: scriptJson,
      });
      success('Dad joke long-form video created. Click "Start render" to generate the video.');
      setShowDadjokeCreateForm(false);
      setSelectedJokeStoryId(null);
      setGeneratedScript(null);
      setCreateSubtitle('');
      setCreateHook('');
      loadData();
    } catch (err) {
      showErrorToast(handleAPIError(err).message || 'Failed to create long-form video');
    } finally {
      setCreatingDadjoke(false);
    }
  };

  const handleStartRender = async (videoId) => {
    try {
      setRenderingId(videoId);
      const res = await orbixNetworkAPI.startLongformDadjokeRender(videoId, apiParams());
      const status = res.status;
      const data = res.data || {};
      if (status === 202 || data.success) {
        success(data.message || 'Render started. This may take several minutes — the page will update when it’s done.');
        if (videoDetail?.id === videoId) {
          setVideoDetail((prev) => (prev ? { ...prev, render_status: 'RENDERING' } : null));
        }
        loadData();
      } else {
        showErrorToast(data.error || 'Render failed');
      }
    } catch (err) {
      showErrorToast(handleAPIError(err).message || 'Render failed');
    } finally {
      setRenderingId(null);
    }
  };

  const handleGenerateBackground = async (videoId) => {
    try {
      setGeneratingBackgroundId(videoId);
      const res = await orbixNetworkAPI.generateLongformDadjokeBackground(videoId, apiParams());
      const url = res.data?.background_image_url;
      const urls = res.data?.background_image_urls;
      if (videoDetail?.id === videoId && (url || urls)) {
        setVideoDetail((prev) => (prev ? { ...prev, generated_background_url: url || prev.generated_background_url, generated_background_urls: urls || prev.generated_background_urls } : null));
      }
      success(urls ? '5 background images generated. Approve below or regenerate.' : 'Background image generated. Approve it below or regenerate.');
    } catch (err) {
      showErrorToast(handleAPIError(err).message || 'Failed to generate image');
    } finally {
      setGeneratingBackgroundId(null);
    }
  };

  const handleResetRender = async (videoId) => {
    try {
      setResettingRenderId(videoId);
      await orbixNetworkAPI.resetLongformDadjokeRender(videoId, apiParams());
      success('Render reset. You can click Start render to try again.');
      if (videoDetail?.id === videoId) {
        setVideoDetail((prev) => (prev ? { ...prev, render_status: 'FAILED' } : null));
      }
      loadData();
    } catch (err) {
      showErrorToast(handleAPIError(err).message || 'Reset failed');
    } finally {
      setResettingRenderId(null);
    }
  };

  const handleUploadSegmentImage = async (videoId, segmentKey, file) => {
    if (!file) return;
    try {
      setUploadingSegmentKey(segmentKey);
      const form = new FormData();
      form.append('file', file);
      form.append('segment_key', segmentKey);
      const res = await orbixNetworkAPI.uploadLongformDadjokeSegmentImage(videoId, form, apiParams());
      const urls = res.data?.background_image_urls;
      const url = res.data?.url;
      if (videoDetail?.id === videoId && (urls || url)) {
        setVideoDetail((prev) => (prev ? {
          ...prev,
          generated_background_url: prev.generated_background_url || url,
          generated_background_urls: { ...(prev.generated_background_urls || {}), ...(urls || { [segmentKey]: url }) },
        } : null));
      }
      success(`Image set for ${segmentKey.replace(/_/g, ' ')}.`);
    } catch (err) {
      showErrorToast(handleAPIError(err).message || 'Upload failed');
    } finally {
      setUploadingSegmentKey(null);
    }
  };

  return (
    <AuthGuard>
      <V2AppShell>
        <div className="p-6 space-y-6">
          {/* Short Form / Long Form tabs */}
          <div className="border-b border-gray-200">
            <nav className="flex gap-0" aria-label="Content type">
              <Link
                href={`/dashboard/v2/modules/orbix-network/dashboard${currentChannelId ? `?channel=${currentChannelId}` : ''}`}
                className="px-4 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              >
                Short Form
              </Link>
              <span className="px-4 py-3 text-sm font-medium border-b-2 border-blue-600 text-blue-600 bg-white">
                Long Form
              </span>
            </nav>
          </div>

          <div>
            <h1 className="text-2xl font-bold text-gray-900">Long-form videos</h1>
            <p className="text-gray-600 text-sm mt-1">
              {isDadJokeChannel
                ? 'Story-then-punchline long-form (6–10 min): pick a dad joke from shorts, generate a script, create a video.'
                : 'Puzzle library and long-form explanation videos for this channel.'}
            </p>
          </div>

          {!currentChannelId ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
              Select a channel above to view puzzles and long-form videos.
            </div>
          ) : loading ? (
            <div className="flex items-center gap-2 text-gray-600">
              <Loader className="w-5 h-5 animate-spin" />
              Loading…
            </div>
          ) : (
            <>
              {/* Long-form videos list */}
              <div className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Film className="w-5 h-5" />
                    Long-form videos
                  </h2>
                  {isDadJokeChannel ? (
                    <button
                      type="button"
                      onClick={() => setShowDadjokeCreateForm(!showDadjokeCreateForm)}
                      className="inline-flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"
                    >
                      <Sparkles className="w-4 h-4" />
                      New dad joke long-form
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowCreateForm(!showCreateForm)}
                      className="inline-flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"
                    >
                      <Plus className="w-4 h-4" />
                      New long-form video
                    </button>
                  )}
                </div>
                {videos.length === 0 ? (
                  <p className="text-gray-500 text-sm">
                    {isDadJokeChannel
                      ? 'No long-form videos yet. Create one by picking a dad joke and generating a script.'
                      : 'No long-form videos yet. Create one by selecting puzzles below.'}
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-200">
                    {videos.map((v) => (
                      <li key={v.id} className="py-3 flex items-center justify-between gap-4">
                        <button
                          type="button"
                          onClick={() => isDadJokeChannel && v.longform_type === 'dadjoke' && setSelectedVideoDetailId(v.id)}
                          className={`min-w-0 flex-1 text-left ${isDadJokeChannel && v.longform_type === 'dadjoke' ? 'cursor-pointer hover:bg-gray-50 -mx-2 px-2 py-1 rounded' : ''}`}
                        >
                          <span className="font-medium">{v.title || 'Untitled'}</span>
                          {v.longform_type === 'dadjoke' && (
                            <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">Dad joke</span>
                          )}
                          {v.subtitle && (
                            <span className="text-gray-500 text-sm ml-2">— {v.subtitle}</span>
                          )}
                          <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                            {v.longform_type === 'dadjoke' ? 'Story → joke' : `${v.total_puzzles} puzzle(s)`} · {v.render_status}
                            {v.duration_seconds != null && ` · ${Number(v.duration_seconds)}s`}
                            {isDadJokeChannel && v.longform_type === 'dadjoke' && (
                              <ChevronRight className="w-3.5 h-3.5 text-gray-400" aria-hidden />
                            )}
                          </div>
                        </button>
                        {isDadJokeChannel && v.longform_type === 'dadjoke' && (
                          <div className="shrink-0 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            {v.render_status === 'COMPLETED' && v.video_path ? (
                              <a
                                href={v.video_path}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-indigo-600 hover:underline"
                              >
                                Watch
                              </a>
                            ) : (v.render_status === 'PENDING' || v.render_status === 'FAILED') && (
                              <button
                                type="button"
                                onClick={() => handleStartRender(v.id)}
                                disabled={renderingId != null}
                                className="text-sm px-3 py-1.5 bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {renderingId === v.id ? (
                                  <>
                                    <Loader className="w-3.5 h-3.5 inline animate-spin mr-1" />
                                    Rendering…
                                  </>
                                ) : (
                                  'Start render'
                                )}
                              </button>
                            )}
                            {(v.render_status === 'RENDERING' || v.render_status === 'PROCESSING') && (
                              <span className="text-sm text-gray-500 flex items-center gap-2">
                                <span className="flex items-center gap-1">
                                  <Loader className="w-3.5 h-3.5 animate-spin" />
                                  Rendering…
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleResetRender(v.id); }}
                                  disabled={resettingRenderId != null}
                                  className="text-xs text-amber-600 hover:underline disabled:opacity-50"
                                >
                                  {resettingRenderId === v.id ? 'Resetting…' : 'Reset render'}
                                </button>
                              </span>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Dad joke long-form create flow (Dad Jokes channel only) */}
              {isDadJokeChannel && showDadjokeCreateForm && (
                <div className="bg-white rounded-lg shadow p-4 border border-amber-100">
                  <h3 className="font-semibold mb-3">Create dad joke long-form video</h3>
                  <p className="text-sm text-gray-600 mb-3">
                    Pick a dad joke you&apos;ve already posted as a short. We&apos;ll generate a 6–10 minute story that builds up to that joke.
                  </p>
                  <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-2 mb-4">
                    {dadjokeJokes.length === 0 ? (
                      <p className="text-gray-500 text-sm">No dad jokes in this channel yet. Create shorts first (Pipeline → approve dad jokes).</p>
                    ) : (
                      <ul className="space-y-1">
                        {dadjokeJokes.map((j) => (
                          <li key={j.story_id} className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedJokeStoryId(selectedJokeStoryId === j.story_id ? null : j.story_id)}
                              className={`w-6 h-6 rounded border flex items-center justify-center shrink-0 ${
                                selectedJokeStoryId === j.story_id
                                  ? 'bg-indigo-600 border-indigo-600 text-white'
                                  : 'border-gray-300 hover:border-indigo-400'
                              }`}
                            >
                              {selectedJokeStoryId === j.story_id ? <Check className="w-3.5 h-3.5" /> : null}
                            </button>
                            <span className="text-sm flex-1" title={`${j.setup} → ${j.punchline}`}>
                              {j.setup?.slice(0, 50)}{j.setup?.length > 50 ? '…' : ''} → {j.punchline?.slice(0, 30)}{j.punchline?.length > 30 ? '…' : ''}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 mb-4">
                    <button
                      type="button"
                      onClick={handleGenerateDadjokeScript}
                      disabled={generatingScript || !selectedJokeStoryId}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                      {generatingScript ? <Loader className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      Generate script
                    </button>
                    {generatedScript && (
                      <button
                        type="button"
                        onClick={handleCreateDadjokeVideo}
                        disabled={creatingDadjoke}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm"
                      >
                        {creatingDadjoke ? <Loader className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        Create video record
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { setShowDadjokeCreateForm(false); setSelectedJokeStoryId(null); setGeneratedScript(null); }}
                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                  {generatedScript && (
                    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 text-sm space-y-2">
                      <p><strong>Title:</strong> {generatedScript.title}</p>
                      <p><strong>Est. duration:</strong> {generatedScript.estimated_duration_seconds}s</p>
                      <p className="text-gray-600">
                        <strong>Script:</strong>{' '}
                        <button
                          type="button"
                          onClick={() => setShowFullScriptModal(true)}
                          className="text-indigo-600 hover:underline text-left inline"
                        >
                          {generatedScript.full_script?.slice(0, 200)}…
                        </button>
                        <span className="text-indigo-600 text-xs ml-1">(tap to see full script)</span>
                      </p>
                      {showFullScriptModal && (
                        <div
                          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
                          onClick={() => setShowFullScriptModal(false)}
                          role="dialog"
                          aria-modal="true"
                          aria-label="Full script"
                        >
                          <div
                            className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-between p-4 border-b">
                              <h4 className="font-semibold">Full script</h4>
                              <button
                                type="button"
                                onClick={() => setShowFullScriptModal(false)}
                                className="p-2 rounded hover:bg-gray-100 text-gray-600"
                                aria-label="Close"
                              >
                                <X className="w-5 h-5" />
                              </button>
                            </div>
                            <div className="p-4 overflow-y-auto flex-1 whitespace-pre-wrap text-sm text-gray-800">
                              {generatedScript.full_script || 'No script text.'}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Dad joke video detail modal (script, visuals, generated image) */}
              {selectedVideoDetailId && isDadJokeChannel && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
                  onClick={() => { setSelectedVideoDetailId(null); setVideoDetail(null); }}
                  role="dialog"
                  aria-modal="true"
                  aria-label="Video details"
                >
                  <div
                    className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between p-4 border-b shrink-0">
                      <h3 className="text-lg font-semibold truncate pr-2">
                        {videoDetail?.title || videos.find((v) => v.id === selectedVideoDetailId)?.title || 'Video details'}
                      </h3>
                      <button
                        type="button"
                        onClick={() => { setSelectedVideoDetailId(null); setVideoDetail(null); }}
                        className="p-2 rounded hover:bg-gray-100 text-gray-600 shrink-0"
                        aria-label="Close"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="p-4 overflow-y-auto flex-1 space-y-4">
                      {videoDetailLoading ? (
                        <div className="flex items-center gap-2 text-gray-600 py-8">
                          <Loader className="w-5 h-5 animate-spin" />
                          Loading…
                        </div>
                      ) : videoDetail ? (
                        <>
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <span>{videoDetail.render_status}</span>
                            {videoDetail.duration_seconds != null && (
                              <span>· {Number(videoDetail.duration_seconds)}s</span>
                            )}
                            {videoDetail.dadjoke_data?.script_json?.dad_activity && (
                              <span>· {videoDetail.dadjoke_data.script_json.dad_activity}</span>
                            )}
                          </div>

                          <section>
                            <h4 className="font-medium flex items-center gap-2 text-gray-900 mb-2">
                              <FileText className="w-4 h-4" />
                              Script
                            </h4>
                            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 max-h-60 overflow-y-auto">
                              <p className="whitespace-pre-wrap text-sm text-gray-800">
                                {videoDetail.dadjoke_data?.script_json?.full_script || 'No script stored.'}
                              </p>
                            </div>
                          </section>

                          {videoDetail.dadjoke_data?.script_json?.visual_suggestions && typeof videoDetail.dadjoke_data.script_json.visual_suggestions === 'object' && (
                            <section>
                              <h4 className="font-medium flex items-center gap-2 text-gray-900 mb-2">
                                <ImageIcon className="w-4 h-4" />
                                Visual suggestions (per segment)
                              </h4>
                              <ul className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-1.5 text-sm">
                                {Object.entries(videoDetail.dadjoke_data.script_json.visual_suggestions).map(([key, value]) => (
                                  <li key={key} className="flex gap-2">
                                    <span className="text-gray-500 shrink-0">{key.replace(/_/g, ' ')}:</span>
                                    <span className="text-gray-800">{String(value)}</span>
                                  </li>
                                ))}
                              </ul>
                            </section>
                          )}

                          <section>
                            <h4 className="font-medium flex items-center gap-2 text-gray-900 mb-2">
                              <ImageIcon className="w-4 h-4" />
                              Segment images
                            </h4>
                            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600 space-y-3">
                              <p>Assign an image to each section of the script. The renderer will use these in order (cold open → act 1 → act 2 → act 3 → final). Upload your own or generate 5 with AI below.</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {LONGFORM_SEGMENT_KEYS.map((key) => {
                                  const url = videoDetail.generated_background_urls?.[key];
                                  const isUploading = uploadingSegmentKey === key;
                                  return (
                                    <div key={key} className="space-y-1 rounded border border-gray-200 bg-white p-2">
                                      <p className="text-xs font-medium text-gray-700 capitalize">{key.replace(/_/g, ' ')}</p>
                                      {url ? (
                                        <img
                                          src={url}
                                          alt={`Scene: ${key.replace(/_/g, ' ')}`}
                                          className="rounded w-full h-auto max-h-32 object-cover bg-gray-100 border border-gray-200"
                                        />
                                      ) : (
                                        <div className="rounded w-full h-24 bg-gray-100 border border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-xs">
                                          No image
                                        </div>
                                      )}
                                      <label className="inline-flex items-center gap-1.5 mt-1 cursor-pointer">
                                        <input
                                          type="file"
                                          accept="image/png,image/jpeg,image/jpg,image/webp"
                                          className="sr-only"
                                          disabled={isUploading}
                                          onChange={(e) => {
                                            const f = e.target.files?.[0];
                                            if (f) handleUploadSegmentImage(videoDetail.id, key, f);
                                            e.target.value = '';
                                          }}
                                        />
                                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded text-xs font-medium text-gray-700">
                                          {isUploading ? <Loader className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                                          {url ? 'Replace' : 'Upload'}
                                        </span>
                                      </label>
                                    </div>
                                  );
                                })}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleGenerateBackground(videoDetail.id)}
                                disabled={generatingBackgroundId === videoDetail.id}
                                className="inline-flex items-center gap-2 px-3 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 text-sm"
                              >
                                {generatingBackgroundId === videoDetail.id ? (
                                  <>
                                    <Loader className="w-4 h-4 animate-spin" />
                                    Generating 5 images…
                                  </>
                                ) : (
                                  <>
                                    <Sparkles className="w-4 h-4" />
                                    Generate 5 images with AI
                                  </>
                                )}
                              </button>
                            </div>
                          </section>
                        </>
                      ) : (
                        <p className="text-gray-500 text-sm">Could not load video details.</p>
                      )}
                    </div>
                    {videoDetail && isDadJokeChannel && (
                      <div className="p-4 border-t flex items-center justify-between gap-2 shrink-0">
                        <span className="text-sm text-gray-500">
                          {(videoDetail.render_status === 'RENDERING' || videoDetail.render_status === 'PROCESSING') ? (
                            <span className="flex items-center gap-2">
                              <span className="flex items-center gap-1.5">
                                <Loader className="w-4 h-4 animate-spin" />
                                Rendering… (this may take several minutes)
                              </span>
                              <button
                                type="button"
                                onClick={() => handleResetRender(videoDetail.id)}
                                disabled={resettingRenderId != null}
                                className="text-amber-600 hover:underline disabled:opacity-50 text-sm"
                              >
                                {resettingRenderId === videoDetail.id ? 'Resetting…' : 'Reset render'}
                              </button>
                            </span>
                          ) : (
                            videoDetail.render_status
                          )}
                        </span>
                        <div className="flex items-center gap-2">
                          {videoDetail.render_status === 'COMPLETED' && videoDetail.video_path && (
                            <a
                              href={videoDetail.video_path}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"
                            >
                              Watch
                            </a>
                          )}
                          {(videoDetail.render_status === 'PENDING' || videoDetail.render_status === 'FAILED') && (
                            <button
                              type="button"
                              onClick={() => handleStartRender(videoDetail.id)}
                              disabled={renderingId != null}
                              className="px-3 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 text-sm"
                            >
                              {renderingId === videoDetail.id ? (
                                <>
                                  <Loader className="w-4 h-4 inline animate-spin mr-1" />
                                  Starting…
                                </>
                              ) : (
                                'Start render'
                              )}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => { setSelectedVideoDetailId(null); setVideoDetail(null); }}
                            className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Create form (puzzle long-form; non–Dad Joke channels only) */}
              {!isDadJokeChannel && showCreateForm && (
                <div className="bg-white rounded-lg shadow p-4 border border-indigo-100">
                  <h3 className="font-semibold mb-3">Create long-form video</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                    <input
                      type="text"
                      placeholder="Title"
                      value={createTitle}
                      onChange={(e) => setCreateTitle(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2"
                    />
                    <input
                      type="text"
                      placeholder="Subtitle (optional)"
                      value={createSubtitle}
                      onChange={(e) => setCreateSubtitle(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2"
                    />
                    <input
                      type="text"
                      placeholder="Hook text (optional)"
                      value={createHook}
                      onChange={(e) => setCreateHook(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 md:col-span-2"
                    />
                  </div>
                  <p className="text-sm text-gray-600 mb-2">Select puzzles (order = display order):</p>
                  <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-2 mb-4">
                    {puzzles.length === 0 ? (
                      <p className="text-gray-500 text-sm">No puzzles in library. Run backfill or approve mindteaser stories first.</p>
                    ) : (
                      <ul className="space-y-1">
                        {puzzles.map((p) => (
                          <li key={p.id} className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => togglePuzzleSelection(p.id)}
                              className={`w-6 h-6 rounded border flex items-center justify-center shrink-0 ${
                                selectedPuzzleIds.includes(p.id)
                                  ? 'bg-indigo-600 border-indigo-600 text-white'
                                  : 'border-gray-300 hover:border-indigo-400'
                              }`}
                            >
                              {selectedPuzzleIds.includes(p.id) ? <Check className="w-3.5 h-3.5" /> : null}
                            </button>
                            <span className="text-sm truncate flex-1" title={p.question}>
                              {p.question?.slice(0, 80)}{p.question?.length > 80 ? '…' : ''}
                            </span>
                            {(p.longform_usage_count ?? 0) > 0 && (
                              <span className="text-xs text-gray-500 shrink-0">
                                Used in {p.longform_usage_count} video(s)
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleCreateVideo}
                      disabled={creating || selectedPuzzleIds.length === 0}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {creating ? <Loader className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      Create video record
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCreateForm(false)}
                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Puzzle library (only for non–Dad Joke channels) */}
              {!isDadJokeChannel && (
              <div className="bg-white rounded-lg shadow p-4">
                <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                  <ListChecks className="w-5 h-5" />
                  Puzzle library
                </h2>
                <div className="flex gap-2 mb-4">
                  <span className="text-sm text-gray-600">Used in long-form:</span>
                  <button
                    type="button"
                    onClick={() => setUsedFilter('')}
                    className={`px-2 py-1 rounded text-sm ${usedFilter === '' ? 'bg-gray-800 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setUsedFilter('false')}
                    className={`px-2 py-1 rounded text-sm ${usedFilter === 'false' ? 'bg-gray-800 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
                  >
                    Unused
                  </button>
                  <button
                    type="button"
                    onClick={() => setUsedFilter('true')}
                    className={`px-2 py-1 rounded text-sm ${usedFilter === 'true' ? 'bg-gray-800 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
                  >
                    Used
                  </button>
                </div>
                {puzzles.length === 0 ? (
                  <p className="text-gray-500 text-sm">No puzzles. Run the backfill script (npm run backfill:orbix-puzzles) or approve mindteaser stories.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-left">
                          <th className="py-2 pr-2">Question</th>
                          <th className="py-2 pr-2">Type</th>
                          <th className="py-2 pr-2">Family</th>
                          <th className="py-2 pr-2">Answer</th>
                          <th className="py-2 pr-2">Long-form usage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {puzzles.map((p) => (
                          <tr key={p.id} className="border-b border-gray-100">
                            <td className="py-2 pr-2 max-w-xs truncate" title={p.question}>
                              {p.question}
                            </td>
                            <td className="py-2 pr-2 text-gray-600">{p.type ?? '—'}</td>
                            <td className="py-2 pr-2 text-gray-600">{p.family ?? '—'}</td>
                            <td className="py-2 pr-2 max-w-[120px] truncate" title={p.answer}>
                              {p.answer}
                            </td>
                            <td className="py-2 pr-2">
                              {(p.longform_usage_count ?? 0) === 0 ? (
                                <span className="text-gray-400">Never</span>
                              ) : (
                                <span title={(p.longform_video_titles || []).join(', ')}>
                                  {p.longform_usage_count} video(s)
                                  {(p.longform_video_titles || []).length > 0 && (
                                    <span className="text-gray-500 ml-1">
                                      — {(p.longform_video_titles || []).join(', ')}
                                    </span>
                                  )}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              )}
            </>
          )}
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}
