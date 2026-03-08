'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import { orbixNetworkAPI } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import { handleAPIError } from '@/lib/errorHandler';
import { ArrowLeft, Loader, Film, ListChecks, Plus, Check, X } from 'lucide-react';
import { useOrbixChannel } from '../OrbixChannelContext';

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

  useEffect(() => {
    if (!currentChannelId) {
      setLoading(false);
      setPuzzles([]);
      setVideos([]);
      return;
    }
    loadData();
  }, [currentChannelId, usedFilter]);

  const loadData = async () => {
    try {
      setLoading(true);
      const params = { ...apiParams() };
      if (usedFilter) params.used_in_longform = usedFilter;
      const [puzzlesRes, videosRes] = await Promise.all([
        orbixNetworkAPI.getLongformPuzzles(params),
        orbixNetworkAPI.getLongformVideos(apiParams()),
      ]);
      setPuzzles(puzzlesRes.data?.puzzles ?? []);
      setVideos(videosRes.data?.videos ?? []);
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

  return (
    <AuthGuard>
      <V2AppShell>
        <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/v2/modules/orbix-network/dashboard"
              className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </Link>
          </div>

          <div>
            <h1 className="text-2xl font-bold text-gray-900">Long-form videos</h1>
            <p className="text-gray-600 text-sm mt-1">
              Puzzle library and long-form explanation videos for this channel.
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
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(!showCreateForm)}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    New long-form video
                  </button>
                </div>
                {videos.length === 0 ? (
                  <p className="text-gray-500 text-sm">No long-form videos yet. Create one by selecting puzzles below.</p>
                ) : (
                  <ul className="divide-y divide-gray-200">
                    {videos.map((v) => (
                      <li key={v.id} className="py-3 flex items-center justify-between">
                        <div>
                          <span className="font-medium">{v.title || 'Untitled'}</span>
                          {v.subtitle && (
                            <span className="text-gray-500 text-sm ml-2">— {v.subtitle}</span>
                          )}
                          <div className="text-xs text-gray-500 mt-0.5">
                            {v.total_puzzles} puzzle(s) · {v.render_status}
                            {v.duration_seconds != null && ` · ${Number(v.duration_seconds)}s`}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Create form */}
              {showCreateForm && (
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

              {/* Puzzle library */}
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
            </>
          )}
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}
