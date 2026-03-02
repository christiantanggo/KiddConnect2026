'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import { orbixNetworkAPI } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import { handleAPIError } from '@/lib/errorHandler';
import { useOrbixChannel } from '../OrbixChannelContext';
import {
  ArrowLeft, Loader, Save, Plus, Trash2, CheckCircle2, Upload,
  Youtube, Image, Music, Rss, Settings2, Loader2, X, Clock
} from 'lucide-react';

// Common timezone list for the schedule picker
const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Phoenix', 'America/Anchorage', 'America/Honolulu',
  'America/Toronto', 'America/Vancouver', 'America/Edmonton', 'America/Winnipeg',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Rome',
  'Europe/Amsterdam', 'Europe/Stockholm', 'Europe/Warsaw', 'Europe/Athens',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Seoul',
  'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Bangkok', 'Asia/Jakarta',
  'Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane', 'Australia/Perth',
  'Pacific/Auckland', 'Pacific/Auckland',
  'America/Sao_Paulo', 'America/Buenos_Aires', 'America/Bogota', 'America/Mexico_City',
  'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Lagos',
];

// ─── Global settings (not per-channel) ───────────────────────────────────────

function GlobalSettingsSection({ settings, setSettings, saving, onSave, onTriggerPipeline, triggeringPipeline }) {
  return (
    <div className="space-y-6">
      {/* Review Preferences */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-gray-500" />
          Review Preferences
        </h2>
        <div className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.review_mode_enabled}
              onChange={(e) => setSettings((s) => ({ ...s, review_mode_enabled: e.target.checked }))}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Enable review mode (stories require approval before rendering)</span>
          </label>

          {settings.review_mode_enabled && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Auto-approve after (minutes)</label>
              <input
                type="number"
                value={settings.auto_approve_minutes}
                onChange={(e) => setSettings((s) => ({ ...s, auto_approve_minutes: parseInt(e.target.value) || 60 }))}
                className="w-48 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                min="0"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Minimum shock score threshold</label>
            <input
              type="number"
              value={settings.shock_score_threshold}
              onChange={(e) => setSettings((s) => ({ ...s, shock_score_threshold: parseInt(e.target.value) ?? 45 }))}
              className="w-48 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
              min="0"
              max="100"
            />
            <p className="mt-1 text-xs text-gray-500">Lower values allow more stories (default 45).</p>
          </div>
        </div>
      </div>

      {/* Publishing Preferences */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Publishing Preferences</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">YouTube Visibility</label>
            <select
              value={settings.youtube_visibility}
              onChange={(e) => setSettings((s) => ({ ...s, youtube_visibility: e.target.value }))}
              className="w-48 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            >
              <option value="public">Public</option>
              <option value="unlisted">Unlisted</option>
              <option value="private">Private</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Daily video cap</label>
            <input
              type="number"
              value={settings.daily_video_cap}
              onChange={(e) => setSettings((s) => ({ ...s, daily_video_cap: parseInt(e.target.value) || 5 }))}
              className="w-48 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
              min="1"
              max="50"
            />
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.enable_rumble}
              onChange={(e) => setSettings((s) => ({ ...s, enable_rumble: e.target.checked }))}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Enable Rumble publishing (coming soon)</span>
          </label>
        </div>
      </div>

      {/* Posting Schedule */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <Clock className="w-5 h-5 text-gray-500" />
          Posting Schedule
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Set the times videos are auto-created and posted each day. The pipeline scrapes, renders, and posts all at the same time by default.
        </p>
        <div className="space-y-5">

          {/* Timezone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
            <select
              value={settings.posting_timezone}
              onChange={(e) => setSettings((s) => ({ ...s, posting_timezone: e.target.value }))}
              className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>

          {/* Posting window */}
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Posting window start</label>
              <input
                type="time"
                value={settings.posting_window_start}
                onChange={(e) => setSettings((s) => ({ ...s, posting_window_start: e.target.value }))}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Posting window end</label>
              <input
                type="time"
                value={settings.posting_window_end}
                onChange={(e) => setSettings((s) => ({ ...s, posting_window_end: e.target.value }))}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
              />
            </div>
          </div>
          <p className="text-xs text-gray-400 -mt-3">Videos will only post within this window. Posts outside the window are skipped until the next day.</p>

          {/* Post times */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">📤 Post times</label>
            <p className="text-xs text-gray-400 mb-3">
              Each time = one video posted to YouTube.
              {settings.slot_times.length === 0 && ' Using defaults: 8am, 11am, 2pm, 5pm, 8pm.'}
            </p>
            <div className="space-y-2">
              {settings.slot_times.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="time"
                    value={t}
                    onChange={(e) => {
                      const updated = [...settings.slot_times];
                      updated[i] = e.target.value;
                      setSettings((s) => ({ ...s, slot_times: updated.sort() }));
                    }}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                  />
                  <button
                    onClick={() => setSettings((s) => ({ ...s, slot_times: s.slot_times.filter((_, idx) => idx !== i) }))}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg border border-red-200"
                    title="Remove this slot"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => {
                const last = settings.slot_times[settings.slot_times.length - 1];
                let next = '09:00';
                if (last) {
                  const [h, m] = last.split(':').map(Number);
                  const newH = (h + 1) % 24;
                  next = `${String(newH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                }
                setSettings((s) => ({ ...s, slot_times: [...s.slot_times, next].sort() }));
              }}
              className="mt-3 flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              <Plus className="w-4 h-4" />
              Add post time
            </button>
            {settings.slot_times.length > 0 && (
              <button
                onClick={() => setSettings((s) => ({ ...s, slot_times: [] }))}
                className="mt-2 flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Reset to defaults (8am, 11am, 2pm, 5pm, 8pm)
              </button>
            )}
          </div>

          {/* Pipeline run times */}
          <div className="border-t border-gray-100 pt-5">
            <label className="block text-sm font-medium text-gray-700 mb-2">⚙️ Pipeline run times (scrape &amp; render)</label>
            <p className="text-xs text-gray-400 mb-3">
              When the system scrapes content, generates scripts, and creates videos.
              {settings.pipeline_run_times.length === 0
                ? ' Defaults to same time as each post slot (scrape, render, and post happen together). Set custom times here if you want the pipeline to run earlier for more buffer.'
                : ''}
            </p>
            <div className="space-y-2">
              {settings.pipeline_run_times.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="time"
                    value={t}
                    onChange={(e) => {
                      const updated = [...settings.pipeline_run_times];
                      updated[i] = e.target.value;
                      setSettings((s) => ({ ...s, pipeline_run_times: updated.sort() }));
                    }}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                  />
                  <button
                    onClick={() => setSettings((s) => ({ ...s, pipeline_run_times: s.pipeline_run_times.filter((_, idx) => idx !== i) }))}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg border border-red-200"
                    title="Remove"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => {
                const last = settings.pipeline_run_times[settings.pipeline_run_times.length - 1];
                let next = '07:00';
                if (last) {
                  const [h, m] = last.split(':').map(Number);
                  const newH = (h + 1) % 24;
                  next = `${String(newH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                }
                setSettings((s) => ({ ...s, pipeline_run_times: [...s.pipeline_run_times, next].sort() }));
              }}
              className="mt-3 flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              <Plus className="w-4 h-4" />
              Add pipeline time
            </button>
            {settings.pipeline_run_times.length > 0 && (
              <button
                onClick={() => setSettings((s) => ({ ...s, pipeline_run_times: [] }))}
                className="mt-2 flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Reset to auto (1 hour before each post)
              </button>
            )}
          </div>

          {/* Pipeline status + manual trigger */}
          <div className="border-t border-gray-100 pt-5">
            <p className="text-sm font-medium text-gray-700 mb-2">🔁 Pipeline status</p>
            {settings.last_pipeline_run_at ? (
              <div className="bg-green-50 rounded-lg p-3 border border-green-100 mb-3">
                <p className="text-xs font-medium text-green-700">✅ Last ran successfully</p>
                <p className="text-xs text-green-600 mt-0.5">
                  {new Date(settings.last_pipeline_run_at).toLocaleString()}
                </p>
              </div>
            ) : (
              <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-100 mb-3">
                <p className="text-xs font-medium text-yellow-700">⚠️ Pipeline has not run yet</p>
                <p className="text-xs text-yellow-600 mt-0.5">It will run automatically at the scheduled times above once you save settings.</p>
              </div>
            )}
            <button
              onClick={onTriggerPipeline}
              disabled={!!triggeringPipeline}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium"
            >
              {triggeringPipeline ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rss className="w-4 h-4" />}
              {triggeringPipeline ? 'Running pipeline…' : 'Run pipeline now (test)'}
            </button>
            {triggeringPipeline && (
              <p className="text-xs text-gray-500 mt-2">Scraping, processing, and queueing a render… this may take up to 60 seconds.</p>
            )}
          </div>

          {/* Live schedule preview */}
          {(settings.slot_times.length > 0 || settings.pipeline_run_times.length > 0) && (
            <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
              <p className="text-xs font-medium text-blue-700 mb-1">📅 Schedule preview</p>
              <div className="space-y-0.5">
                {settings.slot_times.map((t, i) => {
                  const [h, m] = t.split(':').map(Number);
                  const fmt = (hh, mm) => {
                    const ampm = hh < 12 ? 'am' : 'pm';
                    const h12 = hh % 12 || 12;
                    return `${h12}:${String(mm).padStart(2, '0')}${ampm}`;
                  };
                  // Find matching pipeline time (custom or same as post slot)
                  const pipelineTime = settings.pipeline_run_times[i]
                    ? (() => { const [ph, pm] = settings.pipeline_run_times[i].split(':').map(Number); return fmt(ph, pm); })()
                    : null;
                  return (
                    <p key={i} className="text-xs text-blue-600">
                      {pipelineTime && pipelineTime !== fmt(h, m)
                        ? `${pipelineTime} scrape & render → ${fmt(h, m)} post to YouTube`
                        : `${fmt(h, m)} scrape, render & post to YouTube`}
                    </p>
                  );
                })}
                {settings.pipeline_run_times.filter((_, i) => i >= settings.slot_times.length).map((t, i) => {
                  const [h, m] = t.split(':').map(Number);
                  const fmt = (hh, mm) => {
                    const ampm = hh < 12 ? 'am' : 'pm';
                    const h12 = hh % 12 || 12;
                    return `${h12}:${String(mm).padStart(2, '0')}${ampm}`;
                  };
                  return (
                    <p key={`extra-${i}`} className="text-xs text-blue-600">
                      {fmt(h, m)} scrape &amp; render (no matching post slot)
                    </p>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Video Behaviour */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Video Behaviour</h2>
        <p className="text-xs text-gray-500 mb-4">Toggle features for A/B testing. Changes take effect on the next render.</p>
        <div className="space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.auto_upload_enabled}
              onChange={(e) => setSettings((s) => ({ ...s, auto_upload_enabled: e.target.checked }))}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 mt-0.5"
            />
            <span className="text-sm text-gray-700">
              <span className="font-medium">Auto-upload to YouTube after render</span>
              <span className="block text-xs text-gray-500 mt-0.5">
                When off, rendered videos stay in &quot;Ready for Upload&quot; for manual review before going live.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.enable_intro_hook}
              onChange={(e) => setSettings((s) => ({ ...s, enable_intro_hook: e.target.checked }))}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 mt-0.5"
            />
            <span className="text-sm text-gray-700">
              <span className="font-medium">Show intro hook text (0–1s)</span>
              <span className="block text-xs text-gray-500 mt-0.5">
                When off, videos start immediately with the trivia question — no &quot;Can you guess this?&quot; frame.
                Recommended off to reduce early swipe-aways.
              </span>
            </span>
          </label>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={onSave}
          disabled={saving}
          className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving…' : 'Save global settings'}
        </button>
      </div>
    </div>
  );
}

// ─── Per-channel tab content ──────────────────────────────────────────────────

function ChannelSettingsTab({ channel }) {
  const { success, error: showError } = useToast();
  const apiParams = useCallback(() => ({ channel_id: channel.id }), [channel.id]);
  const apiBody = useCallback(() => ({ channel_id: channel.id }), [channel.id]);

  // YouTube
  const [ytConnected, setYtConnected] = useState(false);
  const [ytChannel, setYtChannel] = useState(null);
  const [connectingYt, setConnectingYt] = useState(false);
  const [ytSetupMsg, setYtSetupMsg] = useState(null);

  // Backgrounds
  const [backgrounds, setBackgrounds] = useState([]);
  const [loadingBg, setLoadingBg] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);
  const bgFileRef = useRef(null);
  const [bgMode, setBgMode] = useState('uniform');

  // Music
  const [musicTracks, setMusicTracks] = useState([]);
  const [loadingMusic, setLoadingMusic] = useState(false);
  const [uploadingMusic, setUploadingMusic] = useState(false);
  const musicFileRef = useRef(null);

  // Sources
  const [sources, setSources] = useState([]);
  const [loadingSources, setLoadingSources] = useState(false);
  const [showAddSource, setShowAddSource] = useState(false);
  const [sourceForm, setSourceForm] = useState({ type: 'RSS', url: '', name: '', category_hint: null });
  const [addingSource, setAddingSource] = useState(false);

  // Active sub-tab within the channel
  const [subTab, setSubTab] = useState('youtube');

  // Loading state for the whole channel tab
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [ytRes, bgRes, musicRes, srcRes] = await Promise.all([
          orbixNetworkAPI.getYoutubeChannel(apiParams()).catch(() => ({ data: { connected: false, channel: null } })),
          orbixNetworkAPI.getBackgrounds(apiParams()).catch(() => ({ data: { backgrounds: [] } })),
          orbixNetworkAPI.getMusic(apiParams()).catch(() => ({ data: { music: [] } })),
          orbixNetworkAPI.getSources(apiParams()).catch(() => ({ data: { sources: [] } })),
        ]);
        if (cancelled) return;
        setYtConnected(ytRes.data?.connected ?? false);
        setYtChannel(ytRes.data?.channel ?? null);
        setBackgrounds(bgRes.data?.backgrounds || []);
        setMusicTracks(musicRes.data?.music || []);
        setSources(srcRes.data?.sources || []);
      } catch (e) {
        if (!cancelled) showError('Failed to load channel settings');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [channel.id]);

  // ── YouTube handlers ──
  const handleConnectYt = async () => {
    setConnectingYt(true);
    try {
      const res = await orbixNetworkAPI.getYoutubeAuthUrl(apiParams());
      if (res.data?.configured === false) {
        setYtSetupMsg(res.data?.setup_instructions || res.data?.message || 'YouTube OAuth not configured. Add YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REDIRECT_URI to .env.');
        return;
      }
      if (res.data?.auth_url) window.location.href = res.data.auth_url;
    } catch (e) {
      showError(handleAPIError(e).message || 'Failed to connect YouTube');
    } finally {
      setConnectingYt(false);
    }
  };

  const handleDisconnectYt = async () => {
    try {
      await orbixNetworkAPI.disconnectYoutube(apiBody());
      setYtConnected(false);
      setYtChannel(null);
      success('YouTube disconnected');
    } catch (e) {
      showError(handleAPIError(e).message || 'Failed to disconnect YouTube');
    }
  };

  // ── Background handlers ──
  const handleUploadBg = async (e) => {
    const file = e?.target?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showError('Please select an image file (PNG, JPG, WebP).'); return; }
    if (file.size > 20 * 1024 * 1024) { showError('Image must be under 20MB.'); return; }
    try {
      setUploadingBg(true);
      const fd = new FormData();
      fd.append('file', file);
      fd.append('channel_id', channel.id);
      await orbixNetworkAPI.uploadBackground(fd);
      success('Background uploaded');
      const res = await orbixNetworkAPI.getBackgrounds(apiParams());
      setBackgrounds(res.data?.backgrounds || []);
    } catch (e) {
      showError(handleAPIError(e).message || 'Upload failed');
    } finally {
      setUploadingBg(false);
      if (bgFileRef.current) bgFileRef.current.value = '';
    }
  };

  // ── Music handlers ──
  const handleUploadMusic = async (e) => {
    const file = e?.target?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('audio/') && !/\.(mp3|m4a|wav|aac)$/i.test(file.name || '')) {
      showError('Please select an audio file (MP3, M4A, WAV, AAC).');
      return;
    }
    if (file.size > 20 * 1024 * 1024) { showError('Audio must be under 20MB.'); return; }
    try {
      setUploadingMusic(true);
      const fd = new FormData();
      fd.append('file', file);
      fd.append('channel_id', channel.id);
      await orbixNetworkAPI.uploadMusic(fd);
      success('Music track uploaded');
      const res = await orbixNetworkAPI.getMusic(apiParams());
      setMusicTracks(res.data?.music || []);
    } catch (e) {
      showError(handleAPIError(e).message || 'Upload failed');
    } finally {
      setUploadingMusic(false);
      if (musicFileRef.current) musicFileRef.current.value = '';
    }
  };

  // ── Source handlers ──
  const handleAddSource = async () => {
    const needsUrl = sourceForm.type !== 'WIKIPEDIA' && sourceForm.type !== 'TRIVIA_GENERATOR' && sourceForm.type !== 'WIKIDATA_FACTS';
    if (needsUrl && !(sourceForm.url || '').trim()) { showError('Source URL is required'); return; }
    const defaultName = sourceForm.type === 'TRIVIA_GENERATOR' ? 'Trivia Generator'
      : sourceForm.type === 'WIKIDATA_FACTS' ? 'Wikidata Facts'
      : sourceForm.type === 'WIKIPEDIA' ? (sourceForm.category_hint === 'money' ? 'Money (Wikipedia)' : 'Psychology (Wikipedia)')
      : '';
    const name = (sourceForm.name || '').trim() || defaultName;
    if (!name) { showError('Source name is required'); return; }
    try {
      setAddingSource(true);
      const res = await orbixNetworkAPI.addSource({ ...sourceForm, name, ...apiBody() });
      setSources((s) => [...s, res.data.source]);
      setShowAddSource(false);
      setSourceForm({ type: 'RSS', url: '', name: '', category_hint: null });
      success('Source added');
    } catch (e) {
      showError(handleAPIError(e).message || 'Failed to add source');
    } finally {
      setAddingSource(false);
    }
  };

  const handleToggleSource = async (src) => {
    try {
      const res = await orbixNetworkAPI.updateSource(src.id, { enabled: !src.enabled });
      setSources((s) => s.map((x) => x.id === src.id ? res.data.source : x));
    } catch (e) {
      showError(handleAPIError(e).message || 'Failed to update source');
    }
  };

  const handleDeleteSource = async (id) => {
    if (!confirm('Delete this source?')) return;
    try {
      await orbixNetworkAPI.deleteSource(id, apiParams());
      setSources((s) => s.filter((x) => x.id !== id));
      success('Source deleted');
    } catch (e) {
      showError(handleAPIError(e).message || 'Failed to delete source');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    );
  }

  const subTabs = [
    { id: 'youtube', label: 'YouTube', icon: Youtube },
    { id: 'backgrounds', label: 'Backgrounds', icon: Image },
    { id: 'music', label: 'Music', icon: Music },
    { id: 'sources', label: 'Sources', icon: Rss },
  ];

  return (
    <div>
      {/* Sub-tabs */}
      <div className="flex border-b border-gray-200 mb-6 gap-1">
        {subTabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSubTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              subTab === id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            {id === 'youtube' && (
              <span className={`ml-1 w-2 h-2 rounded-full ${ytConnected ? 'bg-green-500' : 'bg-amber-400'}`} />
            )}
          </button>
        ))}
      </div>

      {/* ── YouTube sub-tab ── */}
      {subTab === 'youtube' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Connect a YouTube account to this channel. Completed renders will automatically upload to that YouTube account.
          </p>

          {ytSetupMsg && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm font-medium text-red-800 mb-1">YouTube OAuth not configured on the server</p>
              <p className="text-sm text-red-700">
                {typeof ytSetupMsg === 'string' ? ytSetupMsg : ytSetupMsg.short}
              </p>
              <button onClick={() => setYtSetupMsg(null)} className="mt-2 text-xs text-red-600 underline">Dismiss</button>
            </div>
          )}

          {ytConnected && ytChannel ? (
            <div className="flex items-center justify-between flex-wrap gap-4 p-4 bg-green-50 border border-green-200 rounded-xl">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-green-800">Connected</p>
                  <p className="text-sm text-green-700">{ytChannel.title || ytChannel.id}</p>
                </div>
              </div>
              <button
                onClick={handleDisconnectYt}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-sm text-amber-800 mb-3">No YouTube account connected for this channel.</p>
              <button
                onClick={handleConnectYt}
                disabled={connectingYt}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm font-medium"
              >
                {connectingYt ? (
                  <><Loader className="w-4 h-4 animate-spin" /> Connecting…</>
                ) : (
                  <>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                    </svg>
                    Connect YouTube account
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Backgrounds sub-tab ── */}
      {subTab === 'backgrounds' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Upload background images for this channel. Renders will randomly pick from these; if none, the global set is used.
          </p>

          <div className="flex items-center gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Randomization mode</label>
              <select
                value={bgMode}
                onChange={(e) => setBgMode(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="uniform">Uniform (equal chance)</option>
                <option value="weighted">Weighted (performance-based)</option>
              </select>
            </div>

            <div className="pt-5">
              <input ref={bgFileRef} type="file" accept="image/png,image/jpeg,image/jpg,image/webp" className="hidden" onChange={handleUploadBg} />
              <button
                onClick={() => bgFileRef.current?.click()}
                disabled={uploadingBg}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 disabled:opacity-50 text-sm"
              >
                {uploadingBg ? <Loader className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploadingBg ? 'Uploading…' : 'Upload image'}
              </button>
            </div>
          </div>

          {loadingBg ? (
            <div className="flex items-center gap-2 text-sm text-gray-500"><Loader className="w-4 h-4 animate-spin" /> Loading…</div>
          ) : backgrounds.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">No images uploaded yet.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {backgrounds.map((bg) => (
                <div key={bg.path} className="rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
                  <a href={bg.url} target="_blank" rel="noopener noreferrer" className="block aspect-[9/16] max-h-32">
                    <img src={bg.url} alt={bg.name} className="w-full h-full object-cover" />
                  </a>
                  <p className="p-2 text-xs text-gray-600 truncate" title={bg.name}>{bg.name}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Music sub-tab ── */}
      {subTab === 'music' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Upload background music for this channel. Renders will randomly use one; if none, no music is added.
          </p>

          <div>
            <input ref={musicFileRef} type="file" accept="audio/mp3,audio/mpeg,audio/mp4,audio/m4a,audio/wav,audio/aac,.mp3,.m4a,.wav,.aac" className="hidden" onChange={handleUploadMusic} />
            <button
              onClick={() => musicFileRef.current?.click()}
              disabled={uploadingMusic}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 disabled:opacity-50 text-sm"
            >
              {uploadingMusic ? <Loader className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploadingMusic ? 'Uploading…' : 'Upload music'}
            </button>
          </div>

          {loadingMusic ? (
            <div className="flex items-center gap-2 text-sm text-gray-500"><Loader className="w-4 h-4 animate-spin" /> Loading…</div>
          ) : musicTracks.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">No music tracks uploaded yet.</p>
          ) : (
            <ul className="space-y-2">
              {musicTracks.map((t) => (
                <li key={t.path} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <Music className="w-4 h-4 text-gray-400 shrink-0" />
                  <span className="text-sm text-gray-800 truncate flex-1" title={t.name}>{t.name}</span>
                  {t.url && (
                    <audio controls src={t.url} className="h-8 max-w-[200px]" />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Sources sub-tab ── */}
      {subTab === 'sources' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">Content sources scraped for this channel.</p>
            <button
              onClick={() => setShowAddSource(true)}
              className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Add source
            </button>
          </div>

          {showAddSource && (
            <div className="p-4 border border-gray-200 rounded-xl bg-gray-50 space-y-3">
              <div className="flex justify-between items-center mb-1">
                <h4 className="text-sm font-semibold text-gray-800">New source</h4>
                <button onClick={() => { setShowAddSource(false); setSourceForm({ type: 'RSS', url: '', name: '', category_hint: null }); }}>
                  <X className="w-4 h-4 text-gray-400 hover:text-gray-700" />
                </button>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                <select
                  value={sourceForm.type === 'WIKIPEDIA' && sourceForm.category_hint === 'money' ? 'WIKIPEDIA_MONEY' : sourceForm.type}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === 'WIKIPEDIA_MONEY') setSourceForm((f) => ({ ...f, type: 'WIKIPEDIA', category_hint: 'money' }));
                    else if (v === 'TRIVIA_GENERATOR') setSourceForm((f) => ({ ...f, type: 'TRIVIA_GENERATOR', url: 'trivia://generator', category_hint: null }));
                    else setSourceForm((f) => ({ ...f, type: v, category_hint: v === 'WIKIPEDIA' ? null : undefined }));
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
                >
                  <option value="RSS">RSS Feed</option>
                  <option value="HTML">HTML Scraper</option>
                  <option value="WIKIPEDIA">Wikipedia (Psychology)</option>
                  <option value="WIKIPEDIA_MONEY">Wikipedia (Money)</option>
                  <option value="TRIVIA_GENERATOR">Trivia Generator</option>
                  <option value="WIKIDATA_FACTS">Wikidata Facts</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">URL</label>
                <input
                  type="text"
                  value={sourceForm.type === 'TRIVIA_GENERATOR' ? 'trivia://generator' : sourceForm.url}
                  onChange={(e) => sourceForm.type !== 'TRIVIA_GENERATOR' && setSourceForm((f) => ({ ...f, url: e.target.value }))}
                  readOnly={sourceForm.type === 'TRIVIA_GENERATOR'}
                  placeholder={
                    sourceForm.type === 'TRIVIA_GENERATOR' ? 'trivia://generator (auto)' :
                    sourceForm.type === 'WIKIPEDIA' ? 'Leave blank for default categories' :
                    'https://example.com/feed.xml'
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                <input
                  type="text"
                  value={sourceForm.name}
                  onChange={(e) => setSourceForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="My Source"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleAddSource}
                  disabled={addingSource}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium flex items-center gap-2"
                >
                  {addingSource && <Loader className="w-3 h-3 animate-spin" />}
                  Add source
                </button>
                <button
                  onClick={() => { setShowAddSource(false); setSourceForm({ type: 'RSS', url: '', name: '', category_hint: null }); }}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {loadingSources ? (
            <div className="flex items-center gap-2 text-sm text-gray-500"><Loader className="w-4 h-4 animate-spin" /> Loading…</div>
          ) : sources.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">No sources configured for this channel.</p>
          ) : (
            <div className="space-y-2">
              {sources.map((src) => (
                <div key={src.id} className="flex items-center justify-between gap-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800 truncate">{src.name || src.url}</span>
                      <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">{src.type}</span>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${src.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {src.enabled ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                    {src.url && src.url !== 'trivia://generator' && (
                      <p className="text-xs text-gray-500 truncate mt-0.5">{src.url}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleToggleSource(src)}
                      className="px-3 py-1 text-xs border border-gray-300 rounded-lg hover:bg-gray-100"
                    >
                      {src.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      onClick={() => handleDeleteSource(src.id)}
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg border border-red-200"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main settings page ───────────────────────────────────────────────────────

function OrbixNetworkSettingsInner() {
  const { success, error: showError } = useToast();
  const { channels, currentChannelId, setCurrentChannelId, loading: channelsLoading, refetchChannels } = useOrbixChannel();
  const searchParams = useSearchParams();

  // Which top-level tab: 'global' or a channel id
  const [activeTab, setActiveTab] = useState(null);

  // Global settings
  const [settings, setSettings] = useState({
    review_mode_enabled: true,
    auto_approve_minutes: 60,
    youtube_visibility: 'public',
    enable_rumble: false,
    daily_video_cap: 5,
    shock_score_threshold: 45,
    auto_upload_enabled: true,
    enable_intro_hook: false,
    posting_timezone: 'America/New_York',
    posting_window_start: '07:00',
    posting_window_end: '20:00',
    slot_times: [],
    pipeline_run_times: [],
    last_pipeline_run_at: null,
  });
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [saving, setSaving] = useState(false);
  const [triggeringPipeline, setTriggeringPipeline] = useState(false);

  // When channels load, default active tab to ?channel= param, then current channel, then first channel
  useEffect(() => {
    if (channelsLoading) return;
    const paramChannelId = searchParams?.get('channel');
    if (channels.length > 0) {
      setActiveTab((prev) => {
        if (prev && (prev === 'global' || channels.some((c) => c.id === prev))) return prev;
        // Prefer the URL param if it matches a real channel
        if (paramChannelId && channels.some((c) => c.id === paramChannelId)) return paramChannelId;
        return currentChannelId || channels[0].id;
      });
    } else {
      setActiveTab('global');
    }
  }, [channels, channelsLoading, currentChannelId, searchParams]);

  // Load global settings once
  useEffect(() => {
    async function load() {
      try {
        setLoadingSettings(true);
        const res = await orbixNetworkAPI.getSetupStatus().catch(() => ({ data: { existing_data: {} } }));
        const data = res.data?.existing_data || {};
        setSettings({
          review_mode_enabled: data.review_mode_enabled !== false,
          auto_approve_minutes: data.auto_approve_minutes || 60,
          youtube_visibility: data.youtube_visibility || 'public',
          enable_rumble: data.enable_rumble || false,
          daily_video_cap: data.daily_video_cap || 5,
          shock_score_threshold: data.shock_score_threshold ?? 45,
          auto_upload_enabled: data.auto_upload_enabled !== false,
          enable_intro_hook: data.enable_intro_hook === true,
          posting_timezone: data.posting_timezone || 'America/New_York',
          posting_window_start: data.posting_window_start || '07:00',
          posting_window_end: data.posting_window_end || '20:00',
          slot_times: Array.isArray(data.slot_times) ? data.slot_times : [],
          pipeline_run_times: Array.isArray(data.pipeline_run_times) ? data.pipeline_run_times : [],
          last_pipeline_run_at: data.last_pipeline_run_at || null,
        });
      } catch (e) {
        showError('Failed to load settings');
      } finally {
        setLoadingSettings(false);
      }
    }
    load();
  }, []);

  const handleSaveGlobal = async () => {
    try {
      setSaving(true);
      await orbixNetworkAPI.saveSetup(3, {
        review_mode_enabled: settings.review_mode_enabled,
        auto_approve_minutes: settings.auto_approve_minutes,
        shock_score_threshold: settings.shock_score_threshold,
        auto_upload_enabled: settings.auto_upload_enabled,
        enable_intro_hook: settings.enable_intro_hook,
      });
      await orbixNetworkAPI.saveSetup(4, {
        youtube_visibility: settings.youtube_visibility,
        enable_rumble: settings.enable_rumble,
        daily_video_cap: settings.daily_video_cap,
        posting_window_start: settings.posting_window_start,
        posting_window_end: settings.posting_window_end,
        posting_timezone: settings.posting_timezone,
        slot_times: settings.slot_times,
        pipeline_run_times: settings.pipeline_run_times,
      });
      success('Settings saved');
    } catch (e) {
      showError(handleAPIError(e).message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTriggerPipeline = async () => {
    try {
      setTriggeringPipeline(true);
      await orbixNetworkAPI.triggerAutomatedPipeline();
      success('Pipeline triggered! Check the Stories and Renders tabs in ~60 seconds.');
      // Reload settings to get updated last_pipeline_run_at
      const res = await orbixNetworkAPI.getSetupStatus().catch(() => ({ data: { existing_data: {} } }));
      const data = res.data?.existing_data || {};
      setSettings((s) => ({ ...s, last_pipeline_run_at: data.last_pipeline_run_at || null }));
    } catch (e) {
      showError(handleAPIError(e).message || 'Failed to trigger pipeline');
    } finally {
      setTriggeringPipeline(false);
    }
  };

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    if (tabId !== 'global') setCurrentChannelId(tabId);
  };

  if (channelsLoading || loadingSettings) {
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

  const activeChannel = channels.find((c) => c.id === activeTab);

  return (
    <AuthGuard>
      <V2AppShell>
        <div className="p-6 max-w-5xl mx-auto space-y-6">
          {/* Header */}
          <div>
            <Link
              href="/dashboard/v2/modules/orbix-network/dashboard"
              className="inline-flex items-center text-sm text-gray-500 hover:text-gray-800 mb-3"
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Back to Dashboard
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Orbix Network Settings</h1>
            <p className="text-sm text-gray-500 mt-1">Manage global preferences and individual channel settings</p>
          </div>

          {/* Tab bar */}
          <div className="flex items-center gap-1 overflow-x-auto border-b border-gray-200 pb-0">
            {/* Global tab */}
            <button
              onClick={() => handleTabChange('global')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors -mb-px ${
                activeTab === 'global'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
              }`}
            >
              <Settings2 className="w-4 h-4" />
              Global Settings
            </button>

            {/* One tab per channel */}
            {channels.map((ch) => (
              <button
                key={ch.id}
                onClick={() => handleTabChange(ch.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors -mb-px ${
                  activeTab === ch.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
                }`}
              >
                <Youtube className="w-4 h-4" />
                {ch.name}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div>
            {activeTab === 'global' && (
              <GlobalSettingsSection
                settings={settings}
                setSettings={setSettings}
                saving={saving}
                onSave={handleSaveGlobal}
                onTriggerPipeline={handleTriggerPipeline}
                triggeringPipeline={triggeringPipeline}
              />
            )}

            {activeChannel && (
              <ChannelSettingsTab key={activeChannel.id} channel={activeChannel} />
            )}
          </div>
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}

export default function OrbixNetworkSettingsPage() {
  return (
    <Suspense>
      <OrbixNetworkSettingsInner />
    </Suspense>
  );
}
