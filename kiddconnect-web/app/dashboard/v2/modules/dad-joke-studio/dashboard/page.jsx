'use client';

import { useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';

const API = (process.env.NEXT_PUBLIC_API_URL || 'https://api.kiddconnect.ca').replace(/\/$/, '');
const MODULE = 'dad-joke-studio';

function getAuthHeaders() {
  if (typeof document === 'undefined') return {};
  const token = document.cookie.split(';').find((c) => c.trim().startsWith('token='))?.split('=')[1];
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}
function getBusinessId() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('activeBusinessId') || localStorage.getItem('businessId');
}

function buildHeaders() {
  return { ...getAuthHeaders(), 'X-Active-Business-Id': getBusinessId() };
}

function isVisualStudioAssetType(t) {
  return ['background', 'thumbnail', 'image'].includes(t);
}

function isAssetEligibleForVideo(a, contentType, formatKey) {
  if (!a || a.deleted_at) return false;
  const scope = a.usage_scope || 'global';
  if (scope === 'global') return true;
  if (scope === 'shorts') return contentType === 'shorts';
  if (scope === 'long_form') return contentType === 'long_form';
  if (scope === 'formats') {
    let keys = a.format_keys;
    if (typeof keys === 'string') {
      try {
        keys = JSON.parse(keys);
      } catch {
        keys = [];
      }
    }
    if (!Array.isArray(keys)) keys = [];
    return keys.includes(formatKey);
  }
  return false;
}

/** Looped preview: setup 4s, countdown 3s, punchline on-screen ~0.5s, then short tail (matches render loop). */
const CLASSIC_SETUP_MS = 4000;
const CLASSIC_COUNTDOWN_MS = 3000;
const CLASSIC_PUNCHLINE_MS = 500;
/** Silent tail before loop (matches ~8s render: 7.5s content + 0.5s pad). */
const CLASSIC_CTA_MS = 500;
const CLASSIC_LOOP_MS = CLASSIC_SETUP_MS + CLASSIC_COUNTDOWN_MS + CLASSIC_PUNCHLINE_MS + CLASSIC_CTA_MS;

function stripEmojiStudio(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu, '').replace(/\s+/g, ' ').trim();
}

function sortedStudioAssetsById(arr) {
  return [...(arr || [])].sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function parseContentJsonStudio(content) {
  let cj = content?.content_json;
  if (typeof cj === 'string') {
    try {
      cj = JSON.parse(cj);
    } catch {
      cj = {};
    }
  }
  return cj && typeof cj === 'object' ? cj : {};
}

function parseStoryboardArrayStudio(content) {
  let sb = content?.storyboard_json;
  if (typeof sb === 'string') {
    try {
      sb = JSON.parse(sb);
    } catch {
      sb = [];
    }
  }
  return Array.isArray(sb) ? sb : [];
}

function storyboardTextByLabel(sb, label) {
  const row = sb.find((x) => String(x?.label || '').toLowerCase() === String(label).toLowerCase());
  return String(row?.text || '').trim();
}

function parseClassicLoopLines(content) {
  const sb = parseStoryboardArrayStudio(content);
  const cj = parseContentJsonStudio(content);
  let setup = storyboardTextByLabel(sb, 'setup') || String(cj.setup || '').trim();
  let punchline = storyboardTextByLabel(sb, 'punchline') || String(cj.punchline || '').trim();
  let cta =
    storyboardTextByLabel(sb, 'cta') ||
    storyboardTextByLabel(sb, 'loop') ||
    storyboardTextByLabel(sb, 'hook') ||
    String(cj.hook || '').trim();

  if (!setup || !punchline) {
    const text = String(content?.script_text || '').trim();
    const punchMatch = text.match(/punchline\s*:\s*(.+?)(?:\n\n|\n*$)/is);
    const setupMatch = text.match(/setup\s*:\s*(.+?)(?:\n\n|punchline\s*:)/is);
    if (setupMatch && punchMatch) {
      setup = setup || setupMatch[1].trim();
      punchline = punchline || punchMatch[1].trim();
    } else {
      const parts = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        setup = setup || parts[0];
        punchline = punchline || parts.slice(1).join(' ');
      }
    }
  }

  if (!setup || !punchline) {
    for (const raw of [String(content?.summary || '').trim(), String(content?.script_text || '').trim()]) {
      if (!raw || raw.includes('\n\n')) continue;
      const q = raw.indexOf('?');
      if (q > 0 && q < raw.length - 2) {
        setup = setup || raw.slice(0, q + 1).trim();
        punchline = punchline || raw.slice(q + 1).trim();
        if (setup && punchline) break;
      }
    }
  }

  if (!cta) cta = 'Rate this dad joke 1–10';
  return { setup, punchline, cta };
}

function deterministicAssetIndex(id, len) {
  if (!len) return 0;
  const s = String(id ?? '0');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % len;
}

function resolveClassicPreviewBackgroundUrl(content, eligibleBg) {
  const sorted = sortedStudioAssetsById(eligibleBg);
  if (!sorted.length) return null;
  const sel = content?.asset_snapshot?.background_asset_id;
  if (sel) {
    const row = sorted.find((a) => String(a.id) === String(sel));
    return row?.public_url || null;
  }
  const idx = deterministicAssetIndex(content?.id, sorted.length);
  return sorted[idx]?.public_url || null;
}

function DadJokeClassicLoopPreview({ aspectRatio, content, eligibleBackgroundAssets, musicNote }) {
  const rawLines = useMemo(() => parseClassicLoopLines(content), [content]);
  const lines = useMemo(
    () => ({
      setup: stripEmojiStudio(rawLines.setup),
      punchline: stripEmojiStudio(rawLines.punchline),
      cta: stripEmojiStudio(rawLines.cta) || rawLines.cta,
    }),
    [rawLines.setup, rawLines.punchline, rawLines.cta]
  );
  const bgUrl = useMemo(
    () => resolveClassicPreviewBackgroundUrl(content, eligibleBackgroundAssets),
    [content?.id, content?.asset_snapshot?.background_asset_id, eligibleBackgroundAssets]
  );
  const [tMs, setTMs] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const start = performance.now();
    function frame() {
      if (cancelled) return;
      const elapsed = (performance.now() - start) % CLASSIC_LOOP_MS;
      setTMs(elapsed);
      requestAnimationFrame(frame);
    }
    const id = requestAnimationFrame(frame);
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [content?.id, rawLines.setup, rawLines.punchline]);

  const phase =
    tMs < CLASSIC_SETUP_MS
      ? 'setup'
      : tMs < CLASSIC_SETUP_MS + CLASSIC_COUNTDOWN_MS
        ? 'countdown'
        : tMs < CLASSIC_SETUP_MS + CLASSIC_COUNTDOWN_MS + CLASSIC_PUNCHLINE_MS
          ? 'punchline'
          : 'cta';

  let barPct = 0;
  if (phase === 'setup') barPct = (tMs / CLASSIC_SETUP_MS) * 100;
  else if (phase === 'countdown') {
    const u = tMs - CLASSIC_SETUP_MS;
    barPct = (u / CLASSIC_COUNTDOWN_MS) * 100;
  } else if (phase === 'punchline') {
    const u = tMs - CLASSIC_SETUP_MS - CLASSIC_COUNTDOWN_MS;
    barPct = (u / CLASSIC_PUNCHLINE_MS) * 100;
  } else barPct = 100;

  let countdownDigit = '';
  if (phase === 'countdown') {
    const u = tMs - CLASSIC_SETUP_MS;
    const idx = Math.min(2, Math.floor(u / 1000));
    countdownDigit = String(3 - idx);
  }

  const hasJoke = Boolean(rawLines.setup && rawLines.punchline);

  return (
    <div>
      <div
        className="mx-auto mb-2 relative overflow-hidden flex flex-col"
        style={{
          aspectRatio,
          maxHeight: 380,
          borderRadius: 8,
          background: '#0f172a',
          color: '#e2e8f0',
        }}
      >
        {bgUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={bgUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.55) 100%)' }}
            />
          </>
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center text-[11px] px-4 text-center"
            style={{ color: 'rgba(248,250,252,0.65)' }}
          >
            No eligible background for this draft — upload under Assets (e.g. Shorts only) or pick one above.
          </div>
        )}
        <div className="relative z-10 flex flex-col flex-1 min-h-0">
          <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 text-center min-h-[180px]">
            {!hasJoke && (
              <p className="text-sm opacity-90">Generate a script or add setup + punchline to see the timed preview.</p>
            )}
            {hasJoke && phase === 'setup' && (
              <p className="text-base sm:text-lg font-semibold leading-snug uppercase tracking-tight" style={{ textShadow: '0 2px 12px rgba(0,0,0,0.85)' }}>
                {lines.setup}
              </p>
            )}
            {hasJoke && phase === 'countdown' && (
              <div className="flex flex-col items-center gap-3 w-full max-w-[95%]">
                <p className="text-sm sm:text-base font-semibold leading-snug uppercase tracking-tight line-clamp-4" style={{ textShadow: '0 2px 12px rgba(0,0,0,0.85)' }}>
                  {lines.setup}
                </p>
                <span className="text-7xl sm:text-8xl font-black tabular-nums leading-none" style={{ textShadow: '0 4px 24px rgba(0,0,0,0.9)' }}>
                  {countdownDigit}
                </span>
                <span className="text-xs uppercase tracking-widest opacity-80" style={{ textShadow: '0 1px 8px rgba(0,0,0,0.8)' }}>
                  Get ready…
                </span>
              </div>
            )}
            {hasJoke && phase === 'punchline' && (
              <p className="text-lg sm:text-xl font-bold leading-snug uppercase tracking-tight" style={{ textShadow: '0 2px 12px rgba(0,0,0,0.85)' }}>
                {lines.punchline}
              </p>
            )}
            {hasJoke && phase === 'cta' && (
              <p className="text-sm sm:text-base font-semibold uppercase tracking-wide opacity-95" style={{ textShadow: '0 2px 12px rgba(0,0,0,0.85)' }}>
                {lines.cta}
              </p>
            )}
          </div>
          <div className="px-[5%] pb-5 pt-1">
            <div className="h-3.5 w-full rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.18)' }}>
              <div
                className="h-full rounded-full transition-none"
                style={{ width: `${Math.min(100, barPct)}%`, background: 'rgba(255,255,255,0.92)' }}
              />
            </div>
            <p className="text-[10px] mt-2 text-center uppercase tracking-wide" style={{ color: 'rgba(248,250,252,0.65)' }}>
              {phase === 'setup' && 'Setup (0–4s)'}
              {phase === 'countdown' && '3 · 2 · 1 (4–7s)'}
              {phase === 'punchline' && 'Punchline'}
              {phase === 'cta' && 'End'}
            </p>
          </div>
        </div>
      </div>
      {musicNote && (
        <p className="text-[10px] mt-1 text-center" style={{ color: 'var(--color-text-muted)' }}>
          {musicNote}
        </p>
      )}
      <p className="text-[10px] mt-1 text-center" style={{ color: 'var(--color-text-muted)' }}>
        Shorts Classic Loop renders use this same layout (centered copy, linear bar, gradient dim). Orbix channel jobs still use the legacy yellow layout.
      </p>
    </div>
  );
}

function DadJokeStudioDashboardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  /** null = checking subscription; unsubscribed users are sent to the module page to activate (avoids settings ↔ marketplace loop). */
  const [accessAllowed, setAccessAllowed] = useState(null);
  const [mainSection, setMainSection] = useState('studio');
  const [studioTop, setStudioTop] = useState('shorts');
  const [formats, setFormats] = useState([]);
  const [shortKey, setShortKey] = useState('shorts_classic_loop');
  const [longKey, setLongKey] = useState('long_style_engine');
  const [styleCategories, setStyleCategories] = useState({});
  const [recipe, setRecipe] = useState({ base: [], tone: [], rhythm: [], topic: [], structure: [] });
  const [styleAnalysis, setStyleAnalysis] = useState(null);
  const [lockedRecipe, setLockedRecipe] = useState({});
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [ideaPrompt, setIdeaPrompt] = useState('');
  const [ideas, setIdeas] = useState([]);
  const [library, setLibrary] = useState([]);
  const [libFilter, setLibFilter] = useState({ content_type: '', format_key: '', status: '' });
  const [assets, setAssets] = useState([]);
  const [ytStatus, setYtStatus] = useState(null);
  const [ytGoogleEmail, setYtGoogleEmail] = useState('');
  const [moduleSettings, setModuleSettings] = useState({});
  const [uploadForm, setUploadForm] = useState({
    title: '',
    description: '',
    tags: '',
    privacy: 'public',
    made_for_kids: false,
    category_id: '23',
    schedule: '',
  });
  const [pollRender, setPollRender] = useState(null);
  /** Latest row from `dadjoke_studio_rendered_outputs` for `content.current_render_id` (includes output_url). */
  const [currentRender, setCurrentRender] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [uploadScope, setUploadScope] = useState('global');
  const [uploadFormatKeys, setUploadFormatKeys] = useState([]);
  const [uploadImagePreviewUrl, setUploadImagePreviewUrl] = useState(null);

  useEffect(() => () => {
    if (uploadImagePreviewUrl) URL.revokeObjectURL(uploadImagePreviewUrl);
  }, [uploadImagePreviewUrl]);

  const loadFormats = useCallback(async () => {
    const res = await fetch(`${API}/api/v2/dad-joke-studio/formats`, { headers: buildHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'formats failed');
    setFormats(data.formats || []);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadFormats();
      const h = buildHeaders();
      /** Parse JSON without failing the whole dashboard if one endpoint errors. */
      const fetchJson = async (url) => {
        const r = await fetch(url, { headers: h });
        const data = await r.json().catch(() => ({}));
        return { ok: r.ok, data, status: r.status };
      };
      const [soR, libR, astR, ytR, msR] = await Promise.all([
        fetchJson(`${API}/api/v2/dad-joke-studio/style-options`),
        fetchJson(`${API}/api/v2/dad-joke-studio/content`),
        fetchJson(`${API}/api/v2/dad-joke-studio/assets`),
        fetchJson(`${API}/api/v2/dad-joke-studio/youtube/status`),
        fetchJson(`${API}/api/v2/settings/modules/${MODULE}`),
      ]);
      if (!soR.ok) throw new Error(soR.data?.error || `Style options failed (${soR.status})`);
      if (!libR.ok) throw new Error(libR.data?.error || `Library failed (${libR.status})`);
      if (!astR.ok) throw new Error(astR.data?.error || `Assets failed (${astR.status})`);
      setStyleCategories(soR.data.categories || {});
      setLibrary(libR.data.items || []);
      setAssets(astR.data.assets || []);
      setYtStatus(ytR.ok ? ytR.data : { connected: false, connected_manual: false });
      setModuleSettings(msR.ok && msR.data?.settings != null ? msR.data.settings : {});
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [loadFormats]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API}/api/v2/modules/${MODULE}`, { headers: buildHeaders() });
        if (!res.ok) {
          if (!cancelled) setAccessAllowed(true);
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        const ok = !!data.module?.subscribed;
        if (!ok) {
          router.replace(`/dashboard/v2/modules/${MODULE}`);
          return;
        }
        setAccessAllowed(true);
      } catch {
        if (!cancelled) setAccessAllowed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (accessAllowed !== true) return;
    loadAll();
  }, [accessAllowed, loadAll]);

  useEffect(() => {
    if (mainSection !== 'ideas') return;
    fetch(`${API}/api/v2/dad-joke-studio/ideas`, { headers: buildHeaders() })
      .then((r) => r.json())
      .then((d) => setIdeas(d.ideas || []))
      .catch(() => {});
  }, [mainSection]);

  useEffect(() => {
    const sec = searchParams.get('studioSection');
    if (sec) setMainSection(sec);
    if (accessAllowed === true && searchParams.get('youtube_connected') === 'true') loadAll();
  }, [searchParams, loadAll, accessAllowed]);

  useEffect(() => {
    if (!pollRender || !content?.id) return;
    const id = content.id;
    const t = setInterval(async () => {
      const res = await fetch(`${API}/api/v2/dad-joke-studio/content/${id}/render-status`, { headers: buildHeaders() });
      const data = await res.json();
      if (data.render?.render_status === 'READY' || data.render?.render_status === 'FAILED') {
        clearInterval(t);
        setPollRender(null);
        setCurrentRender(data.render || null);
        const full = await fetch(`${API}/api/v2/dad-joke-studio/content/${id}`, { headers: buildHeaders() }).then((r) => r.json());
        if (full.item) setContent(full.item);
        if (full.current_render) setCurrentRender(full.current_render);
        loadAll();
      }
    }, 3000);
    return () => clearInterval(t);
  }, [pollRender, content?.id, loadAll]);

  useEffect(() => {
    if (!content?.id) {
      setCurrentRender(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API}/api/v2/dad-joke-studio/content/${content.id}/render-status`, { headers: buildHeaders() });
        const data = await res.json();
        if (!cancelled) setCurrentRender(data.render || null);
      } catch {
        if (!cancelled) setCurrentRender(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [content?.id, content?.status]);

  const formatKey = studioTop === 'shorts' ? shortKey : longKey;
  const currentFormat = formats.find((f) => f.format_key === formatKey);
  const previewAspect = currentFormat?.orientation === 'horizontal_16_9' ? '16 / 9' : '9 / 16';

  async function newContent() {
    setError(null);
    const ct = studioTop === 'shorts' ? 'shorts' : 'long_form';
    const res = await fetch(`${API}/api/v2/dad-joke-studio/content`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({
        content_type: ct,
        format_key: formatKey,
        asset_snapshot: { voice_enabled: true },
        ai_mode: 'manual',
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Failed to create draft');
      return null;
    }
    const item = data.item;
    if (!item?.id) {
      setError('Invalid response from server');
      return null;
    }
    setContent(item);
    return item;
  }

  /** Draft must exist and match the format tabs, or generate/save would no-op or hit the wrong format. */
  function needsNewDraftForTabs() {
    const ct = studioTop === 'shorts' ? 'shorts' : 'long_form';
    if (!content?.id) return true;
    if (content.content_type !== ct || content.format_key !== formatKey) return true;
    return false;
  }

  async function saveContent(patch) {
    if (!content?.id) return;
    const res = await fetch(`${API}/api/v2/dad-joke-studio/content/${content.id}`, {
      method: 'PUT',
      headers: buildHeaders(),
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    setContent(data.item);
  }

  async function openDraftInStudio(id) {
    setError(null);
    setPollRender(null);
    setCurrentRender(null);
    const res = await fetch(`${API}/api/v2/dad-joke-studio/content/${id}`, { headers: buildHeaders() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data?.error || 'Could not load draft');
      return;
    }
    const item = data.item;
    if (!item?.id) {
      setError('Draft not found');
      return;
    }
    if (item.content_type === 'shorts') {
      setStudioTop('shorts');
      if (item.format_key) setShortKey(item.format_key);
    } else {
      setStudioTop('long_form');
      if (item.format_key) setLongKey(item.format_key);
    }
    if (item.content_type === 'long_form') {
      const snap = item.style_recipe_snapshot;
      if (snap && typeof snap === 'object') {
        setRecipe({
          base: Array.isArray(snap.base) ? snap.base : [],
          tone: Array.isArray(snap.tone) ? snap.tone : [],
          rhythm: Array.isArray(snap.rhythm) ? snap.rhythm : [],
          topic: Array.isArray(snap.topic) ? snap.topic : [],
          structure: Array.isArray(snap.structure) ? snap.structure : [],
        });
      } else if (item.format_key === 'long_style_engine') {
        setRecipe({ base: [], tone: [], rhythm: [], topic: [], structure: [] });
      }
    }
    setContent(item);
    if (data.current_render) setCurrentRender(data.current_render);
    setMainSection('studio');
  }

  async function deleteLibraryRow(e, row) {
    e.preventDefault();
    e.stopPropagation();
    if (['RENDERING', 'UPLOADING'].includes(row.status)) {
      setError('Wait for render or upload to finish before deleting.');
      return;
    }
    const label = row.summary || row.format_key || row.id;
    if (!window.confirm(`Remove “${String(label).slice(0, 80)}” from the library? This cannot be undone.`)) return;
    setError(null);
    try {
      const res = await fetch(`${API}/api/v2/dad-joke-studio/content/${row.id}`, {
        method: 'DELETE',
        headers: buildHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || `Delete failed (${res.status})`);
        return;
      }
      setLibrary((prev) => prev.filter((r) => r.id !== row.id));
      if (content?.id === row.id) {
        setContent(null);
        setCurrentRender(null);
        setPollRender(null);
      }
    } catch (err) {
      setError(err.message || 'Delete failed');
    }
  }

  async function runGenerate(extra) {
    setError(null);
    setGenerating(true);
    try {
      let draft = content;
      if (needsNewDraftForTabs()) {
        const created = await newContent();
        if (!created?.id) return;
        draft = created;
      }
      const id = draft.id;
      const body = {
        ai_mode: extra?.ai_mode || 'manual',
        ai_prompt: extra?.ai_prompt ?? draft.ai_prompt,
        style_recipe: studioTop === 'long_form' && longKey === 'long_style_engine' ? recipe : undefined,
        ...extra,
      };
      const res = await fetch(`${API}/api/v2/dad-joke-studio/content/${id}/generate`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify(body),
      });
      let data;
      try {
        data = await res.json();
      } catch {
        setError(`Generate failed (${res.status}). Is the backend running at ${API}?`);
        return;
      }
      if (!res.ok) {
        setError(data?.error || `Generate failed (${res.status})`);
        return;
      }
      setContent(data.item);
    } catch (err) {
      setError(err?.message || 'Generate failed');
    } finally {
      setGenerating(false);
    }
  }

  async function analyzeStyles() {
    const res = await fetch(`${API}/api/v2/dad-joke-studio/style-engine/analyze`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ recipe }),
    });
    const data = await res.json();
    setStyleAnalysis(data);
  }

  async function randomStyles(mode) {
    const res = await fetch(`${API}/api/v2/dad-joke-studio/style-engine/random`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ mode, locked: lockedRecipe }),
    });
    const data = await res.json();
    setRecipe(data.recipe || recipe);
  }

  async function runRender() {
    if (!content?.id) return;
    const res = await fetch(`${API}/api/v2/dad-joke-studio/content/${content.id}/render`, {
      method: 'POST',
      headers: buildHeaders(),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    setPollRender(true);
    setContent((c) =>
      c
        ? {
            ...c,
            status: 'RENDERING',
            current_render_id: data.render_id ?? c.current_render_id,
          }
        : c
    );
    if (data.render_id) {
      setCurrentRender((r) => (r?.id === data.render_id ? r : { id: data.render_id, render_status: 'PENDING', output_url: null }));
    }
  }

  async function runPublish() {
    if (!content?.id || !content.current_render_id) return;
    setError(null);
    const tags = uploadForm.tags.split(',').map((s) => s.trim()).filter(Boolean);
    const res = await fetch(`${API}/api/v2/dad-joke-studio/publish-queue`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({
        generated_content_id: content.id,
        rendered_output_id: content.current_render_id,
        title: uploadForm.title || content.title || 'Dad Joke Video',
        description: uploadForm.description,
        tags,
        privacy_status: uploadForm.privacy,
        self_declared_made_for_kids: uploadForm.made_for_kids,
        category_id: uploadForm.category_id,
        schedule_publish_at_utc: uploadForm.schedule ? new Date(uploadForm.schedule).toISOString() : null,
      }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    loadAll();
  }

  async function generateIdeas() {
    const res = await fetch(`${API}/api/v2/dad-joke-studio/ideas/generate`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ prompt: ideaPrompt, count: 10 }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    const list = await fetch(`${API}/api/v2/dad-joke-studio/ideas`, { headers: buildHeaders() }).then((r) => r.json());
    setIdeas(list.ideas || []);
    loadAll();
  }

  async function saveModuleSettings(nextSettings) {
    const res = await fetch(`${API}/api/v2/settings/modules/${MODULE}`, {
      method: 'PUT',
      headers: buildHeaders(),
      body: JSON.stringify({ settings: nextSettings }),
    });
    if (!res.ok) {
      const d = await res.json();
      throw new Error(d.error || 'Save failed');
    }
    setModuleSettings(nextSettings);
  }

  function toggleTrait(cat, trait) {
    setRecipe((r) => {
      const arr = r[cat] || [];
      const has = arr.includes(trait);
      return { ...r, [cat]: has ? arr.filter((x) => x !== trait) : [...arr, trait] };
    });
  }

  const shortFormats = formats.filter((f) => f.content_type === 'shorts');
  const longFormats = formats.filter((f) => f.content_type === 'long_form');

  /**
   * Which content_type + format_key to use for “eligible” background/music lists.
   * When no draft is open, `content` is null — we still use the active Shorts/Long tab + format keys
   * so uploads don’t look “missing” on the Studio screen (only the Assets tab had the full list before).
   */
  const assetEligibilityContext = useMemo(() => {
    if (content?.content_type && content?.format_key) {
      return { contentType: content.content_type, formatKey: content.format_key };
    }
    const contentType = studioTop === 'long_form' ? 'long_form' : 'shorts';
    const formatKey = studioTop === 'long_form' ? longKey : shortKey;
    return { contentType, formatKey };
  }, [content?.content_type, content?.format_key, studioTop, shortKey, longKey]);

  const eligibleBackgroundAssets = useMemo(() => {
    const { contentType: ct, formatKey: fk } = assetEligibilityContext;
    if (!fk) return [];
    return assets.filter(
      (a) => ['background', 'image'].includes(a.asset_type) && isAssetEligibleForVideo(a, ct, fk)
    );
  }, [assets, assetEligibilityContext]);

  const eligibleMusicAssets = useMemo(() => {
    const { contentType: ct, formatKey: fk } = assetEligibilityContext;
    if (!fk) return [];
    return assets.filter((a) => a.asset_type === 'music' && isAssetEligibleForVideo(a, ct, fk));
  }, [assets, assetEligibilityContext]);

  const classicLoopMusicNote = useMemo(() => {
    const sel = content?.asset_snapshot?.music_asset_id;
    if (sel) {
      const a = eligibleMusicAssets.find((x) => String(x.id) === String(sel));
      return a ? `Render music: ${a.display_name || 'selected track'}` : 'Render music: selected track';
    }
    const sorted = sortedStudioAssetsById(eligibleMusicAssets);
    if (sorted.length > 0) {
      const pick = sorted[deterministicAssetIndex(content?.id, sorted.length)];
      const scope = content?.id ? 'this draft' : 'this format (no draft open)';
      return `Render music: “${pick?.display_name || 'track'}” (same auto-pick as preview for ${scope})`;
    }
    return 'Render music: voice-only (no eligible music for this format)';
  }, [content?.asset_snapshot?.music_asset_id, content?.id, eligibleMusicAssets]);

  async function patchAsset(id, patch) {
    const res = await fetch(`${API}/api/v2/dad-joke-studio/assets/${id}`, {
      method: 'PATCH',
      headers: { ...buildHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Update failed');
    const astRes = await fetch(`${API}/api/v2/dad-joke-studio/assets`, { headers: buildHeaders() }).then((r) => r.json());
    setAssets(astRes.assets || []);
  }

  function toggleUploadFormatKey(key) {
    setUploadFormatKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  if (accessAllowed === null) {
    return (
      <div className="text-sm p-8 text-slate-600 dark:text-slate-300">
        Checking access…
      </div>
    );
  }

  return (
    <div style={{ padding: 16, maxWidth: 1200, margin: '0 auto' }}>
      <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--color-text-main)' }}>
        Dad Joke Studio
      </h1>
      <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
        Ideas → script → approve → render → upload or schedule. Shorts (9:16) and long form (16:9) stay separate.
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#fee2e2', color: '#991b1b' }}>
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-6">
        {['studio', 'ideas', 'library', 'assets', 'upload'].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setMainSection(s)}
            className="px-4 py-2 rounded-lg text-sm font-semibold capitalize"
            style={{
              background: mainSection === s ? 'var(--color-accent)' : 'var(--color-surface)',
              color: mainSection === s ? '#fff' : 'var(--color-text-main)',
              border: '1px solid var(--color-border)',
            }}
          >
            {s === 'ideas' ? 'AI Ideas' : s}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>}

      {mainSection === 'studio' && !loading && (
        <>
          <div className="flex gap-2 mb-3">
            {['shorts', 'long_form'].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setStudioTop(t)}
                className="px-4 py-2 rounded-lg text-sm font-bold"
                style={{
                  background: studioTop === t ? 'linear-gradient(135deg,#6366f1,#ec4899)' : 'var(--color-surface)',
                  color: studioTop === t ? '#fff' : 'var(--color-text-muted)',
                  border: '1px solid var(--color-border)',
                }}
              >
                {t === 'long_form' ? 'Long Form' : 'Shorts'}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1 mb-4 p-1 rounded-xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            {(studioTop === 'shorts' ? shortFormats : longFormats).map((f) => (
              <button
                key={f.format_key}
                type="button"
                onClick={() => (studioTop === 'shorts' ? setShortKey(f.format_key) : setLongKey(f.format_key))}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{
                  background: formatKey === f.format_key ? 'var(--color-accent)' : 'transparent',
                  color: formatKey === f.format_key ? '#fff' : 'var(--color-text-muted)',
                }}
              >
                {f.name}
              </button>
            ))}
          </div>

          {longKey === 'long_style_engine' && studioTop === 'long_form' && (
            <div className="mb-6 p-4 rounded-xl" style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
              <h3 className="font-bold mb-2" style={{ color: 'var(--color-text-main)' }}>Style engine</h3>
              <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
                Pick ~4–8 traits. Conflicts show as warnings only — you can override.
              </p>
              {Object.entries(styleCategories).map(([cat, opts]) => (
                <div key={cat} className="mb-3">
                  <div className="text-xs font-semibold uppercase mb-1" style={{ color: 'var(--color-text-muted)' }}>{cat}</div>
                  <div className="flex flex-wrap gap-1">
                    {opts.map((trait) => (
                      <label key={trait} className="flex items-center gap-1 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(recipe[cat] || []).includes(trait)}
                          onChange={() => toggleTrait(cat, trait)}
                        />
                        {trait}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap gap-2 mt-2">
                <button type="button" className="px-3 py-1 rounded text-xs bg-gray-200" onClick={analyzeStyles}>Check styles</button>
                <button type="button" className="px-3 py-1 rounded text-xs bg-gray-200" onClick={() => randomStyles('safe')}>Safe random</button>
                <button type="button" className="px-3 py-1 rounded text-xs bg-gray-200" onClick={() => randomStyles('creative')}>Creative random</button>
                <button type="button" className="px-3 py-1 rounded text-xs bg-gray-200" onClick={() => randomStyles('wild')}>Wild card</button>
                <button type="button" className="px-3 py-1 rounded text-xs bg-gray-200" onClick={() => setRecipe({ base: [], tone: [], rhythm: [], topic: [], structure: [] })}>Clear all</button>
                <button type="button" className="px-3 py-1 rounded text-xs bg-gray-200" onClick={() => setLockedRecipe({ ...recipe })}>Lock selected styles</button>
              </div>
              <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
                Random (safe / creative / wild) keeps locked traits and fills the rest.
              </p>
              {styleAnalysis?.warnings?.length > 0 && (
                <ul className="mt-2 text-xs text-amber-800 list-disc pl-4">
                  {styleAnalysis.warnings.map((w, i) => (
                    <li key={i}>{w.message}</li>
                  ))}
                </ul>
              )}
              {styleAnalysis?.suggestions?.map((s, i) => (
                <p key={i} className="text-xs text-blue-800 mt-1">{s}</p>
              ))}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <div className="p-4 rounded-xl" style={{ border: '1px solid var(--color-border)' }}>
              <h3 className="font-semibold mb-2">AI & script</h3>
              <label className="text-xs block mb-1">Prompt / direction</label>
              <textarea
                className="w-full border rounded p-2 text-sm mb-2"
                rows={3}
                value={content?.ai_prompt || ''}
                onChange={(e) => setContent((c) => (c ? { ...c, ai_prompt: e.target.value } : c))}
                placeholder="Manual / hybrid topic, or auto mode instructions…"
              />
              <div className="flex flex-wrap gap-2 mb-2 items-center">
                <button
                  type="button"
                  className="px-3 py-1 text-xs rounded text-white disabled:opacity-50"
                  style={{ background: '#6366f1' }}
                  disabled={generating}
                  onClick={() => runGenerate({ ai_mode: 'manual', ai_prompt: content?.ai_prompt })}
                >
                  {generating ? 'Generating…' : 'Generate (uses prompt)'}
                </button>
                <button type="button" className="px-3 py-1 text-xs rounded border disabled:opacity-50" disabled={generating} onClick={() => runGenerate({ ai_mode: 'auto' })}>
                  {generating ? '…' : 'Auto'}
                </button>
                <button type="button" className="px-3 py-1 text-xs rounded border disabled:opacity-50" disabled={generating} onClick={() => runGenerate({ ai_mode: 'hybrid', ai_prompt: content?.ai_prompt })}>
                  {generating ? '…' : 'Hybrid'}
                </button>
                {!content?.id && (
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Creates a draft automatically if needed.</span>
                )}
              </div>
              <button type="button" className="px-3 py-2 text-sm font-semibold rounded mb-2 w-full" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }} onClick={newContent}>
                New draft for this format
              </button>
              <label className="text-xs block mb-1">Script</label>
              <textarea
                className="w-full border rounded p-2 text-sm font-mono"
                rows={12}
                value={content?.script_text || ''}
                onChange={(e) => setContent((c) => (c ? { ...c, script_text: e.target.value } : c))}
              />
              <button type="button" className="mt-2 px-3 py-1 text-xs rounded bg-gray-800 text-white" onClick={() => saveContent({ script_text: content?.script_text, ai_prompt: content?.ai_prompt, style_recipe_snapshot: recipe })}>
                Save draft
              </button>
            </div>

            <div className="p-4 rounded-xl" style={{ border: '1px solid var(--color-border)' }}>
              <h3 className="font-semibold mb-2">Preview & pipeline</h3>
              <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>Orientation: {currentFormat?.orientation} ({currentFormat?.default_width}×{currentFormat?.default_height})</p>
              <div className="mb-3 p-2 rounded border text-xs space-y-2" style={{ borderColor: 'var(--color-border)' }}>
                <p className="font-semibold" style={{ color: 'var(--color-text-main)' }}>Assets for this draft</p>
                <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                  Renders use only Dad Joke Studio uploads (never Orbix stock). If you leave Background/Music on Auto, the same eligible asset is chosen for preview and render (stable for this draft).
                </p>
                {formatKey === 'shorts_classic_loop' && (
                  <p className="text-[11px] rounded p-2" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-main)' }}>
                    <strong>Shorts Classic Loop</strong> uses the same phase order as before (setup → 3-2-1 → punchline → CTA). The <strong>rendered MP4 follows the dashboard preview</strong> (centered text, linear progress bar, gradient dim). Your <strong>background and music</strong> come from the uploads and picks below.
                  </p>
                )}
                <label className="block text-[11px] font-medium">Background</label>
                <select
                  className="w-full border rounded p-1 text-xs"
                  value={content?.asset_snapshot?.background_asset_id || ''}
                  onChange={async (e) => {
                    const v = e.target.value || null;
                    if (!content?.id) return;
                    const snap = { ...(content.asset_snapshot || {}), voice_enabled: content.asset_snapshot?.voice_enabled !== false };
                    await saveContent({ asset_snapshot: { ...snap, background_asset_id: v, music_asset_id: snap.music_asset_id || null } });
                  }}
                  disabled={!content?.id}
                >
                  <option value="">Auto (same pick as preview for this draft)</option>
                  {eligibleBackgroundAssets.map((a) => (
                    <option key={a.id} value={a.id}>{a.display_name || a.asset_type}</option>
                  ))}
                </select>
                <label className="block text-[11px] font-medium">Music</label>
                <select
                  className="w-full border rounded p-1 text-xs"
                  value={content?.asset_snapshot?.music_asset_id || ''}
                  onChange={async (e) => {
                    const v = e.target.value || null;
                    if (!content?.id) return;
                    const snap = { ...(content.asset_snapshot || {}), voice_enabled: content.asset_snapshot?.voice_enabled !== false };
                    await saveContent({ asset_snapshot: { ...snap, music_asset_id: v, background_asset_id: snap.background_asset_id || null } });
                  }}
                  disabled={!content?.id}
                >
                  <option value="">Auto if any, else voice-only</option>
                  {eligibleMusicAssets.map((a) => (
                    <option key={a.id} value={a.id}>{a.display_name || a.asset_type}</option>
                  ))}
                </select>
                {content?.id && eligibleBackgroundAssets.length === 0 && (
                  <p className="text-amber-800 text-[11px]">No eligible background for this format — upload one in Assets with the right scope.</p>
                )}
              </div>
              {formatKey === 'shorts_classic_loop' ? (
                <DadJokeClassicLoopPreview
                  aspectRatio={previewAspect}
                  content={content}
                  eligibleBackgroundAssets={eligibleBackgroundAssets}
                  musicNote={classicLoopMusicNote}
                />
              ) : (
                <div
                  className="mx-auto mb-3 flex items-center justify-center text-xs p-2 text-center"
                  style={{
                    aspectRatio: previewAspect,
                    maxHeight: 280,
                    background: '#1e293b',
                    color: '#e2e8f0',
                    borderRadius: 8,
                  }}
                >
                  {content?.summary || content?.script_text?.slice(0, 200) || 'Script / storyboard preview for this format.'}
                </div>
              )}
              {content?.status === 'RENDERING' && (
                <p className="text-xs mt-4 text-center" style={{ color: 'var(--color-text-muted)' }}>
                  Rendering video… This usually takes under a minute.
                </p>
              )}
              {currentRender?.render_status === 'FAILED' && (
                <div className="mt-4 p-3 rounded-lg text-sm" style={{ background: '#fee2e2', color: '#991b1b' }}>
                  <p className="font-semibold">Render failed</p>
                  <p className="text-xs mt-1">{currentRender.error_message || 'Try again or check API logs.'}</p>
                </div>
              )}
              {currentRender?.render_status === 'READY' && currentRender.output_url && (
                <div
                  className="mt-4 rounded-xl overflow-hidden border"
                  style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
                >
                  <p className="text-xs font-semibold px-3 pt-3" style={{ color: 'var(--color-text-main)' }}>
                    Render complete — review your video
                  </p>
                  <div className="px-3 pt-2 pb-1" style={{ background: '#0f172a' }}>
                    <video
                      key={currentRender.output_url}
                      controls
                      playsInline
                      preload="metadata"
                      className="w-full max-h-[min(50vh,420px)] object-contain mx-auto bg-black rounded-md"
                      src={currentRender.output_url}
                    >
                      Your browser cannot play this video.
                    </video>
                  </div>
                  <div className="p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                      Add title, privacy, and schedule in the next step.
                    </p>
                    <button
                      type="button"
                      className="px-4 py-2 rounded-lg text-sm font-semibold text-white shrink-0"
                      style={{ background: '#0ea5e9' }}
                      onClick={() => setMainSection('upload')}
                    >
                      Publish or schedule →
                    </button>
                  </div>
                </div>
              )}
              <p className="text-xs mb-1">Storyboard (JSON)</p>
              <pre className="text-[10px] p-2 rounded overflow-auto max-h-24 bg-gray-100">{JSON.stringify(content?.storyboard_json || [], null, 0)}</pre>
              <p className="text-xs mt-2">Status: <strong>{content?.status || '—'}</strong></p>
              <div className="flex flex-wrap gap-2 mt-3">
                <button
                  type="button"
                  className="px-2 py-1 text-xs border rounded"
                  onClick={async () => {
                    if (!content?.id) return;
                    const r = await fetch(`${API}/api/v2/dad-joke-studio/content/${content.id}/submit-review`, { method: 'POST', headers: buildHeaders() });
                    const d = await r.json();
                    if (d.item) setContent(d.item);
                    loadAll();
                  }}
                  disabled={!content?.id}
                >
                  Submit review
                </button>
                <button
                  type="button"
                  className="px-2 py-1 text-xs border rounded"
                  onClick={async () => {
                    if (!content?.id) return;
                    const r = await fetch(`${API}/api/v2/dad-joke-studio/content/${content.id}/approve`, { method: 'POST', headers: buildHeaders() });
                    const d = await r.json();
                    if (d.item) setContent(d.item);
                  }}
                  disabled={!content?.id}
                >
                  Approve
                </button>
                <button type="button" className="px-2 py-1 text-xs rounded text-white" style={{ background: '#10b981' }} onClick={runRender} disabled={!content?.id}>Render video</button>
              </div>
            </div>
          </div>
        </>
      )}

      {mainSection === 'ideas' && (
        <div className="space-y-4">
          <textarea className="w-full border rounded p-2" rows={3} value={ideaPrompt} onChange={(e) => setIdeaPrompt(e.target.value)} placeholder="e.g. 10 dad joke ideas about parenting…" />
          <button type="button" className="px-4 py-2 rounded text-white text-sm" style={{ background: '#6366f1' }} onClick={generateIdeas}>Generate ideas</button>
          <div className="space-y-2">
            {ideas.map((row) => (
              <div key={row.id} className="p-3 rounded border text-sm">
                <p className="font-semibold">{row.prompt?.slice(0, 80)}…</p>
                <ul className="list-decimal pl-4 mt-1">
                  {(row.results_json || []).slice(0, 5).map((it, i) => (
                    <li key={i}>{it.title || it.hook || JSON.stringify(it)}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {mainSection === 'library' && (
        <div>
          <p className="text-sm mb-2" style={{ color: 'var(--color-text-muted)' }}>
            Tap or click a row (or press Enter when focused) to open that draft in Studio. Use <strong>Delete</strong> to remove
            drafts or rendered items from the library (not allowed while a render or YouTube upload is running).
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            <select className="border rounded p-1 text-sm" value={libFilter.content_type} onChange={(e) => setLibFilter((f) => ({ ...f, content_type: e.target.value }))}>
              <option value="">All types</option>
              <option value="shorts">Shorts</option>
              <option value="long_form">Long form</option>
            </select>
            <input className="border rounded p-1 text-sm" placeholder="format_key" value={libFilter.format_key} onChange={(e) => setLibFilter((f) => ({ ...f, format_key: e.target.value }))} />
            <input className="border rounded p-1 text-sm" placeholder="status" value={libFilter.status} onChange={(e) => setLibFilter((f) => ({ ...f, status: e.target.value }))} />
            <button
              type="button"
              className="px-2 py-1 text-xs border rounded"
              onClick={() => {
                const q = new URLSearchParams();
                if (libFilter.content_type) q.set('content_type', libFilter.content_type);
                if (libFilter.format_key) q.set('format_key', libFilter.format_key);
                if (libFilter.status) q.set('status', libFilter.status);
                fetch(`${API}/api/v2/dad-joke-studio/content?${q}`, { headers: buildHeaders() }).then((r) => r.json()).then((d) => setLibrary(d.items || []));
              }}
            >
              Filter
            </button>
          </div>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr style={{ background: 'var(--color-surface)' }}>
                <th className="border p-2 text-left">Type</th>
                <th className="border p-2 text-left">Format</th>
                <th className="border p-2 text-left">Status</th>
                <th className="border p-2 text-left">Summary</th>
                <th className="border p-2 text-left">Created</th>
                <th className="border p-2 text-left w-40">Actions</th>
              </tr>
            </thead>
            <tbody>
              {library.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer hover:opacity-90 focus:outline focus:outline-2 focus:outline-offset-2"
                  style={{ background: 'var(--color-surface)' }}
                  onClick={() => openDraftInStudio(row.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openDraftInStudio(row.id);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`Open draft: ${row.summary || row.format_key || row.id}`}
                >
                  <td className="border p-2">{row.content_type}</td>
                  <td className="border p-2">{row.format_key}</td>
                  <td className="border p-2">{row.status}</td>
                  <td className="border p-2 max-w-xs truncate">{row.summary || row.script_text?.slice(0, 60)}</td>
                  <td className="border p-2">{row.created_at?.slice(0, 10)}</td>
                  <td className="border p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold" style={{ color: '#6366f1' }}>
                        Open →
                      </span>
                      <button
                        type="button"
                        className="text-xs px-2 py-0.5 rounded border border-red-300 text-red-700 hover:bg-red-50"
                        title={
                          ['RENDERING', 'UPLOADING'].includes(row.status)
                            ? 'Wait for render or upload to finish'
                            : 'Remove from library'
                        }
                        disabled={['RENDERING', 'UPLOADING'].includes(row.status)}
                        onClick={(e) => deleteLibraryRow(e, row)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mainSection === 'assets' && (
        <div>
          <p className="text-sm mb-3" style={{ color: 'var(--color-text-muted)' }}>
            <strong>Global</strong> — any short/long video. <strong>Shorts only</strong> / <strong>Long form only</strong> — that side only.
            <strong> Specific formats</strong> — only the checked formats. Renders never pull Orbix stock backgrounds/music.
          </p>
          <form
            className="mb-6 flex flex-col gap-3 border rounded p-3"
            style={{ borderColor: 'var(--color-border)' }}
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              const fd = new FormData(e.target);
              const file = fd.get('file');
              if (!file?.size) return;
              if (uploadScope === 'formats' && uploadFormatKeys.length === 0) {
                setError('Choose at least one format when scope is “Specific formats”.');
                return;
              }
              const h = { Authorization: getAuthHeaders().Authorization, 'X-Active-Business-Id': getBusinessId() };
              const up = new FormData();
              up.append('file', file);
              up.append('asset_type', fd.get('asset_type'));
              up.append('usage_scope', uploadScope);
              up.append('format_keys', JSON.stringify(uploadScope === 'formats' ? uploadFormatKeys : []));
              const res = await fetch(`${API}/api/v2/dad-joke-studio/assets`, { method: 'POST', headers: h, body: up });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) {
                setError(data?.error || `Upload failed (${res.status})`);
                return;
              }
              loadAll();
              e.target.reset();
              setUploadScope('global');
              setUploadFormatKeys([]);
              setUploadImagePreviewUrl(null);
            }}
          >
            <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-start">
              <div
                className="shrink-0 w-full sm:w-36 aspect-square max-h-36 rounded border overflow-hidden flex items-center justify-center text-xs text-center px-1"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
              >
                {uploadImagePreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={uploadImagePreviewUrl} alt="" className="w-full h-full object-contain" />
                ) : (
                  <span style={{ color: 'var(--color-text-muted)' }}>Image preview</span>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-2 min-w-0">
                <div className="flex flex-wrap gap-2 items-end">
                  <input
                    type="file"
                    name="file"
                    required
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file && typeof file.type === 'string' && file.type.startsWith('image/')) {
                        setUploadImagePreviewUrl(URL.createObjectURL(file));
                      } else {
                        setUploadImagePreviewUrl(null);
                      }
                    }}
                  />
                  <select name="asset_type" className="border rounded p-1">
                    <option value="music">music</option>
                    <option value="background">background</option>
                    <option value="thumbnail">thumbnail</option>
                    <option value="image">image</option>
                  </select>
                  <select className="border rounded p-1" value={uploadScope} onChange={(e) => setUploadScope(e.target.value)}>
                    <option value="global">Scope: Global</option>
                    <option value="shorts">Scope: Shorts only</option>
                    <option value="long_form">Scope: Long form only</option>
                    <option value="formats">Scope: Specific formats</option>
                  </select>
                  <button type="submit" className="px-3 py-1 rounded text-white text-sm" style={{ background: '#6366f1' }}>Upload</button>
                </div>
              </div>
            </div>
            {uploadScope === 'formats' && (
              <div className="flex flex-wrap gap-2 text-xs">
                {formats.map((f) => (
                  <label key={f.format_key} className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={uploadFormatKeys.includes(f.format_key)}
                      onChange={() => toggleUploadFormatKey(f.format_key)}
                    />
                    {f.name}
                  </label>
                ))}
              </div>
            )}
          </form>
          <ul className="text-sm space-y-3">
            {assets.map((a) => (
              <li key={a.id} className="border-b pb-2 flex gap-3 items-start">
                <div
                  className="shrink-0 w-20 h-20 rounded border overflow-hidden flex items-center justify-center text-[10px] text-center leading-tight px-0.5"
                  style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
                >
                  {a.public_url && isVisualStudioAssetType(a.asset_type) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.public_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span style={{ color: 'var(--color-text-muted)' }}>{a.asset_type === 'music' ? '♪' : '—'}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                <div className="flex flex-wrap justify-between gap-2 items-start">
                  <div>
                    <span className="font-medium">{a.asset_type}:</span> {a.display_name}
                    <span className="text-xs ml-2 opacity-70">({a.usage_scope || 'global'})</span>
                  </div>
                  <button
                    type="button"
                    className="text-red-600 text-xs"
                    onClick={() => fetch(`${API}/api/v2/dad-joke-studio/assets/${a.id}`, { method: 'DELETE', headers: buildHeaders() }).then(loadAll)}
                  >
                    Remove
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 mt-1 items-center text-xs">
                  <span>Scope:</span>
                  <select
                    className="border rounded p-1"
                    value={a.usage_scope || 'global'}
                    onChange={async (e) => {
                      const v = e.target.value;
                      let fk = Array.isArray(a.format_keys) ? [...a.format_keys] : [];
                      if (v === 'formats' && fk.length === 0 && formats[0]) fk = [formats[0].format_key];
                      try {
                        setError(null);
                        await patchAsset(a.id, { usage_scope: v, format_keys: v === 'formats' ? fk : [] });
                      } catch (err) {
                        setError(err.message);
                      }
                    }}
                  >
                    <option value="global">Global</option>
                    <option value="shorts">Shorts only</option>
                    <option value="long_form">Long form only</option>
                    <option value="formats">Specific formats</option>
                  </select>
                </div>
                {(a.usage_scope || '') === 'formats' && (
                  <div className="mt-2 flex flex-wrap gap-2 text-xs pl-1">
                    {formats.map((f) => (
                      <label key={f.format_key} className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(Array.isArray(a.format_keys) ? a.format_keys : []).includes(f.format_key)}
                          onChange={async () => {
                            const cur = new Set(Array.isArray(a.format_keys) ? a.format_keys : []);
                            if (cur.has(f.format_key)) cur.delete(f.format_key);
                            else cur.add(f.format_key);
                            const next = [...cur];
                            if (next.length === 0) {
                              setError('Keep at least one format, or change scope.');
                              return;
                            }
                            try {
                              setError(null);
                              await patchAsset(a.id, { usage_scope: 'formats', format_keys: next });
                            } catch (err) {
                              setError(err.message);
                            }
                          }}
                        />
                        {f.name}
                      </label>
                    ))}
                  </div>
                )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {mainSection === 'upload' && (
        <div className="space-y-4 max-w-2xl">
          {!content?.id && (
            <p className="text-sm rounded-lg p-3" style={{ background: '#fef3c7', color: '#92400e' }}>
              Open a draft from <strong>Studio</strong> or <strong>Library</strong> first, then return here to publish.
            </p>
          )}
          {content?.id && !content?.current_render_id && (
            <p className="text-sm rounded-lg p-3" style={{ background: '#fef3c7', color: '#92400e' }}>
              This draft has no render yet. Use <strong>Studio</strong> → Approve → <strong>Render video</strong>, then you’ll land here with the file ready to review.
            </p>
          )}
          {content?.current_render_id && currentRender?.render_status === 'READY' && currentRender.output_url && (
            <div
              className="rounded-xl overflow-hidden border"
              style={{ borderColor: 'var(--color-border)', background: '#0f172a' }}
            >
              <video
                key={currentRender.output_url}
                controls
                playsInline
                preload="metadata"
                className="w-full max-h-[min(70vh,720px)] object-contain bg-black"
                src={currentRender.output_url}
              >
                Your browser cannot play this video.
              </video>
              <div className="px-3 py-2 text-xs flex flex-wrap gap-x-4 gap-y-1" style={{ color: 'var(--color-text-muted)' }}>
                <span>
                  <span className="font-semibold" style={{ color: 'var(--color-text-main)' }}>Rendered</span>
                  {currentRender.duration_sec != null && Number.isFinite(Number(currentRender.duration_sec))
                    ? ` · ${Number(currentRender.duration_sec).toFixed(1)}s`
                    : ''}
                  {currentRender.width && currentRender.height ? ` · ${currentRender.width}×${currentRender.height}` : ''}
                </span>
                {content?.title && <span className="truncate max-w-full">{content.title}</span>}
              </div>
            </div>
          )}
          {content?.current_render_id && currentRender && ['PENDING', 'RENDERING'].includes(currentRender.render_status) && (
            <p className="text-sm rounded-lg p-3" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <strong>Rendering…</strong> This page will show the video when processing finishes. You can leave and come back.
            </p>
          )}
          {content?.current_render_id && currentRender?.render_status === 'FAILED' && (
            <div className="text-sm rounded-lg p-3" style={{ background: '#fee2e2', color: '#991b1b' }}>
              <strong>Render failed.</strong> {currentRender.error_message || 'Check server logs or try again from Studio.'}
            </div>
          )}
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Uses the same Google OAuth app as the rest of KiddConnect. If Google shows <strong>redirect_uri_mismatch</strong>, add this exact redirect URI in Google Cloud (see{' '}
            <Link href="/dashboard/v2/modules/dad-joke-studio/settings" className="underline">
              Settings
            </Link>
            ):
          </p>
          <pre
            className="text-xs p-2 rounded border break-all whitespace-pre-wrap mb-2"
            style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-main)' }}
          >
            {ytStatus?.oauth_redirect_uri || `${API}/api/v2/dad-joke-studio/youtube/callback`}
          </pre>
          <p className="text-sm rounded-md p-3 mb-2" style={{ background: 'var(--color-bg)', color: 'var(--color-text-main)' }}>
            <strong>Connect YouTube</strong> opens Google’s account chooser (no pre-selected account). We only store the primary YouTube channel for the Google user you choose.
          </p>
          <p className="text-sm">YouTube: {ytStatus?.connected ? `Connected (${ytStatus.channel_title || 'channel'})` : 'Not connected'}</p>
          <button
            type="button"
            className="px-3 py-2 rounded text-white text-sm mt-2"
            style={{ background: '#c00' }}
            onClick={async () => {
              setError(null);
              const res = await fetch(`${API}/api/v2/dad-joke-studio/youtube/auth-url`, { headers: buildHeaders() });
              const d = await res.json().catch(() => ({}));
              if (d.configured === false) {
                setError(
                  d.error ||
                    'Add OAuth Client ID and Secret in settings or set YOUTUBE_* env on the server (same as Kid Quiz).'
                );
                return;
              }
              if (d.url) window.location.href = d.url;
              else setError(d.error || 'Could not get auth URL');
            }}
          >
            Connect YouTube
          </button>
          <div className="p-3 rounded border text-sm space-y-2">
            <p className="font-semibold">OAuth client (stored in module settings)</p>
            <input className="w-full border p-1 text-xs" placeholder="Client ID" value={moduleSettings?.youtube?.client_id || ''} onChange={(e) => setModuleSettings((s) => ({ ...s, youtube: { ...(s.youtube || {}), client_id: e.target.value } }))} />
            <input className="w-full border p-1 text-xs" placeholder="Client Secret" type="password" value={moduleSettings?.youtube?.client_secret || ''} onChange={(e) => setModuleSettings((s) => ({ ...s, youtube: { ...(s.youtube || {}), client_secret: e.target.value } }))} />
            <button
              type="button"
              className="px-2 py-1 text-xs border rounded"
              onClick={() => saveModuleSettings({ ...moduleSettings, youtube: moduleSettings.youtube }).catch((e) => setError(e.message))}
            >
              Save OAuth app
            </button>
          </div>
          <h3 className="font-bold">Publish current rendered item</h3>
          <input className="w-full border p-2 text-sm" placeholder="Title" value={uploadForm.title} onChange={(e) => setUploadForm((f) => ({ ...f, title: e.target.value }))} />
          <textarea className="w-full border p-2 text-sm" placeholder="Description" value={uploadForm.description} onChange={(e) => setUploadForm((f) => ({ ...f, description: e.target.value }))} />
          <input className="w-full border p-2 text-sm" placeholder="Tags comma separated" value={uploadForm.tags} onChange={(e) => setUploadForm((f) => ({ ...f, tags: e.target.value }))} />
          <select className="border p-2 text-sm" value={uploadForm.privacy} onChange={(e) => setUploadForm((f) => ({ ...f, privacy: e.target.value }))}>
            <option value="public">public</option>
            <option value="unlisted">unlisted</option>
            <option value="private">private</option>
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={uploadForm.made_for_kids} onChange={(e) => setUploadForm((f) => ({ ...f, made_for_kids: e.target.checked }))} />
            Made for kids
          </label>
          <input className="w-full border p-2 text-sm" placeholder="Category ID (YouTube)" value={uploadForm.category_id} onChange={(e) => setUploadForm((f) => ({ ...f, category_id: e.target.value }))} />
          <label className="text-xs block">Schedule (local datetime — browser; must be ≥15 min ahead UTC)</label>
          <input type="datetime-local" className="border p-2 text-sm" value={uploadForm.schedule} onChange={(e) => setUploadForm((f) => ({ ...f, schedule: e.target.value }))} />
          <button type="button" className="px-4 py-2 rounded text-white" style={{ background: '#0ea5e9' }} onClick={runPublish}>
            Publish now or schedule
          </button>
        </div>
      )}
    </div>
  );
}

export default function DadJokeStudioDashboardPage() {
  return (
    <AuthGuard>
      <V2AppShell>
        <Suspense fallback={<div style={{ padding: 24 }}>Loading studio…</div>}>
          <DadJokeStudioDashboardInner />
        </Suspense>
      </V2AppShell>
    </AuthGuard>
  );
}
