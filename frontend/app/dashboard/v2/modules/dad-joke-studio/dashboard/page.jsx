'use client';

import { useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';

const API = (process.env.NEXT_PUBLIC_API_URL || 'https://api.tavarios.com').replace(/\/$/, '');
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

function isAssetEligibleForVideo(a, contentType, formatKey) {
  if (!a || a.deleted_at) return false;
  const scope = a.usage_scope || 'global';
  if (scope === 'global') return true;
  if (scope === 'shorts') return contentType === 'shorts';
  if (scope === 'long_form') return contentType === 'long_form';
  if (scope === 'formats') {
    const keys = Array.isArray(a.format_keys) ? a.format_keys : [];
    return keys.includes(formatKey);
  }
  return false;
}

function DadJokeStudioDashboardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [generating, setGenerating] = useState(false);
  const [uploadScope, setUploadScope] = useState('global');
  const [uploadFormatKeys, setUploadFormatKeys] = useState([]);
  const [suggestingYoutubeMeta, setSuggestingYoutubeMeta] = useState(false);
  const [publishing, setPublishing] = useState(false);

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
      const [so, libRes, astRes, yt] = await Promise.all([
        fetch(`${API}/api/v2/dad-joke-studio/style-options`, { headers: h }).then((r) => r.json()),
        fetch(`${API}/api/v2/dad-joke-studio/content`, { headers: h }).then((r) => r.json()),
        fetch(`${API}/api/v2/dad-joke-studio/assets`, { headers: h }).then((r) => r.json()),
        fetch(`${API}/api/v2/dad-joke-studio/youtube/status`, { headers: h }).then((r) => r.json()),
      ]);
      setStyleCategories(so.categories || {});
      setLibrary(libRes.items || []);
      setAssets(astRes.assets || []);
      setYtStatus(yt);
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
    if (sec) setMainSection(sec === 'upload' ? 'studio' : sec);
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
        const full = await fetch(`${API}/api/v2/dad-joke-studio/content/${id}`, { headers: buildHeaders() }).then((r) => r.json());
        if (full.item) setContent(full.item);
        loadAll();
      }
    }, 3000);
    return () => clearInterval(t);
  }, [pollRender, content?.id, loadAll]);

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
    setMainSection('studio');
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
    setContent((c) => (c ? { ...c, status: 'RENDERING' } : c));
  }

  async function runPublish() {
    if (!content?.id) {
      setError('Open a draft from Studio or Library first.');
      return;
    }
    let renderedOutputId = content.current_render_id;
    if (!renderedOutputId) {
      try {
        const rs = await fetch(`${API}/api/v2/dad-joke-studio/content/${content.id}/render-status`, {
          headers: buildHeaders(),
        });
        const rsData = await rs.json().catch(() => ({}));
        if (rs.ok && rsData.render?.render_status === 'READY' && rsData.render?.id) {
          renderedOutputId = rsData.render.id;
          setContent((c) =>
            c
              ? {
                  ...c,
                  current_render_id: rsData.render.id,
                  status: c.status === 'RENDERING' ? 'RENDERED' : c.status,
                }
              : c
          );
        }
      } catch {
        /* non-fatal */
      }
    }
    if (!renderedOutputId) {
      setError('No render for this draft yet. Approve and render above, then publish in step 4.');
      return;
    }
    setError(null);
    setPublishing(true);
    const tags = uploadForm.tags.split(',').map((s) => s.trim()).filter(Boolean);
    try {
      const res = await fetch(`${API}/api/v2/dad-joke-studio/publish-queue`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({
          generated_content_id: content.id,
          rendered_output_id: renderedOutputId,
          title: uploadForm.title || content.title || 'Dad Joke Video',
          description: uploadForm.description,
          tags,
          privacy_status: uploadForm.privacy,
          self_declared_made_for_kids: uploadForm.made_for_kids,
          category_id: uploadForm.category_id,
          schedule_publish_at_utc: uploadForm.schedule ? new Date(uploadForm.schedule).toISOString() : null,
        }),
      });
      let data = {};
      try {
        data = await res.json();
      } catch {
        setError(`Publish failed (${res.status}). Check the API or try again.`);
        return;
      }
      if (!res.ok) {
        setError(data?.error || `Publish failed (${res.status})`);
        return;
      }
      await loadAll();
    } catch (e) {
      setError(e?.message || 'Publish request failed');
    } finally {
      setPublishing(false);
    }
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

  async function suggestYoutubeMetadataWithAi() {
    if (!content?.id) {
      setError('Create or open a draft in step 1 first, then use AI metadata.');
      return;
    }
    setError(null);
    setSuggestingYoutubeMeta(true);
    try {
      const headers = { ...buildHeaders(), 'Content-Type': 'application/json' };
      const res = await fetch(`${API}/api/v2/dad-joke-studio/youtube/suggest-metadata`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          generated_content_id: content.id,
          script_text: content.script_text ?? '',
          ai_prompt: content.ai_prompt ?? '',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `AI metadata failed (${res.status})`);
      setUploadForm((f) => {
        let nextTags = f.tags;
        if (Array.isArray(data.tags)) {
          nextTags = data.tags.map((t) => String(t).trim()).filter(Boolean).join(', ');
        } else if (typeof data.tags === 'string' && data.tags.trim()) {
          nextTags = data.tags.trim();
        }
        return {
          ...f,
          title: typeof data.title === 'string' && data.title.trim() ? data.title.trim() : f.title,
          description: typeof data.description === 'string' ? data.description : f.description,
          tags: nextTags,
        };
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setSuggestingYoutubeMeta(false);
    }
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

  const eligibleBackgroundAssets = useMemo(() => {
    const ct = content?.content_type;
    const fk = content?.format_key;
    if (!ct || !fk) return [];
    return assets.filter(
      (a) => ['background', 'image'].includes(a.asset_type) && isAssetEligibleForVideo(a, ct, fk)
    );
  }, [assets, content?.content_type, content?.format_key]);

  const eligibleMusicAssets = useMemo(() => {
    const ct = content?.content_type;
    const fk = content?.format_key;
    if (!ct || !fk) return [];
    return assets.filter((a) => a.asset_type === 'music' && isAssetEligibleForVideo(a, ct, fk));
  }, [assets, content?.content_type, content?.format_key]);

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
        Everything for one video stays on <strong>Studio</strong>: script, preview, render, YouTube metadata, and publish.
        Shorts (9:16) and long form (16:9) stay separate. <strong>Library</strong> is only to browse and open drafts or finished items — not for publishing.
        <strong> Assets</strong> is for backgrounds/music. YouTube OAuth lives in <Link href="/dashboard/v2/modules/dad-joke-studio/settings" className="underline">Settings</Link>.
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#fee2e2', color: '#991b1b' }}>
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-6">
        {['studio', 'ideas', 'library', 'assets'].map((s) => (
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
        <Link
          href="/dashboard/v2/modules/dad-joke-studio/settings"
          className="px-4 py-2 rounded-lg text-sm font-semibold"
          style={{
            background: 'var(--color-surface)',
            color: 'var(--color-text-main)',
            border: '1px solid var(--color-border)',
          }}
        >
          Settings
        </Link>
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

          <div className="space-y-6 mb-6">
            <section id="djs-ai-script" className="p-4 rounded-xl" style={{ border: '1px solid var(--color-border)' }}>
              <h3 className="font-semibold mb-3" style={{ color: 'var(--color-text-main)' }}>
                <span className="text-slate-400 mr-2 font-normal">1.</span>AI &amp; script
              </h3>
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
            </section>

            <section id="djs-preview" className="p-4 rounded-xl" style={{ border: '1px solid var(--color-border)' }}>
              <h3 className="font-semibold mb-3" style={{ color: 'var(--color-text-main)' }}>
                <span className="text-slate-400 mr-2 font-normal">2.</span>Preview &amp; pipeline
              </h3>
              <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>Orientation: {currentFormat?.orientation} ({currentFormat?.default_width}×{currentFormat?.default_height})</p>
              <div className="mb-3 p-2 rounded border text-xs space-y-2" style={{ borderColor: 'var(--color-border)' }}>
                <p className="font-semibold" style={{ color: 'var(--color-text-main)' }}>Assets for this draft</p>
                <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                  Renders use only Dad Joke Studio uploads. Empty = random pick from assets eligible for this type/format.
                </p>
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
                  <option value="">Random (eligible library)</option>
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
                  <option value="">Random if any, else voice-only</option>
                  {eligibleMusicAssets.map((a) => (
                    <option key={a.id} value={a.id}>{a.display_name || a.asset_type}</option>
                  ))}
                </select>
                {content?.id && eligibleBackgroundAssets.length === 0 && (
                  <p className="text-amber-800 text-[11px]">No eligible background for this format — upload one in Assets with the right scope.</p>
                )}
              </div>
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
                {content?.summary || content?.script_text?.slice(0, 200) || 'Script / storyboard preview area (static mock).'}
              </div>
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
              {content?.status === 'RENDERED' && (
                <p className="text-xs mt-2 text-green-700">Video ready — fill YouTube metadata below, then publish.</p>
              )}
            </section>

            <section id="djs-metadata" className="p-4 rounded-xl" style={{ border: '1px solid var(--color-border)' }}>
              <h3 className="font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>
                <span className="text-slate-400 mr-2 font-normal">3.</span>YouTube metadata
              </h3>
              <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
                For the draft in steps 1–2. AI suggests title, description, and tags from your script.
              </p>
              {!content?.id && (
                <p className="text-xs rounded-lg p-3 mb-3" style={{ background: '#fef3c7', color: '#92400e' }}>
                  Create or open a draft in step 1 (or pick one from Library) before publishing.
                </p>
              )}
              {content?.id && !content?.current_render_id && (
                <p className="text-xs rounded-lg p-3 mb-3" style={{ background: '#fef3c7', color: '#92400e' }}>
                  Approve and render in step 2 first. You can still edit title and tags here while waiting.
                </p>
              )}
              <button
                type="button"
                className="px-3 py-2 rounded text-sm border font-medium disabled:opacity-50 mb-3"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-main)' }}
                disabled={!content?.id || suggestingYoutubeMeta}
                onClick={() => suggestYoutubeMetadataWithAi()}
              >
                {suggestingYoutubeMeta ? 'AI is writing metadata…' : 'AI: fill YouTube metadata'}
              </button>
              <input className="w-full border p-2 text-sm mb-2 rounded" placeholder="Title" value={uploadForm.title} onChange={(e) => setUploadForm((f) => ({ ...f, title: e.target.value }))} />
              <textarea className="w-full border p-2 text-sm mb-2 rounded" placeholder="Description" rows={4} value={uploadForm.description} onChange={(e) => setUploadForm((f) => ({ ...f, description: e.target.value }))} />
              <input className="w-full border p-2 text-sm mb-2 rounded" placeholder="Tags (comma separated)" value={uploadForm.tags} onChange={(e) => setUploadForm((f) => ({ ...f, tags: e.target.value }))} />
              <div className="flex flex-wrap gap-3 items-center mb-2">
                <select className="border p-2 text-sm rounded" value={uploadForm.privacy} onChange={(e) => setUploadForm((f) => ({ ...f, privacy: e.target.value }))}>
                  <option value="public">public</option>
                  <option value="unlisted">unlisted</option>
                  <option value="private">private</option>
                </select>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={uploadForm.made_for_kids} onChange={(e) => setUploadForm((f) => ({ ...f, made_for_kids: e.target.checked }))} />
                  Made for kids
                </label>
              </div>
              <input className="w-full border p-2 text-sm mb-2 rounded" placeholder="Category ID (YouTube)" value={uploadForm.category_id} onChange={(e) => setUploadForm((f) => ({ ...f, category_id: e.target.value }))} />
              <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Schedule (local datetime; must be ≥15 min ahead UTC)</label>
              <input type="datetime-local" className="border p-2 text-sm rounded w-full max-w-xs" value={uploadForm.schedule} onChange={(e) => setUploadForm((f) => ({ ...f, schedule: e.target.value }))} />
            </section>

            <section id="djs-publish" className="p-4 rounded-xl" style={{ border: '1px solid var(--color-border)' }}>
              <h3 className="font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>
                <span className="text-slate-400 mr-2 font-normal">4.</span>Publish to YouTube
              </h3>
              <p className="text-sm mb-3" style={{ color: 'var(--color-text-muted)' }}>
                YouTube:{' '}
                <strong style={{ color: 'var(--color-text-main)' }}>
                  {ytStatus?.connected ? `Connected (${ytStatus.channel_title || 'channel'})` : 'Not connected'}
                </strong>
                . OAuth, redirect URI, and optional client ID/secret are in{' '}
                <Link href="/dashboard/v2/modules/dad-joke-studio/settings" className="underline font-medium">
                  Settings
                </Link>
                .
              </p>
              <button
                type="button"
                className="px-4 py-2 rounded text-white disabled:opacity-50 text-sm font-semibold"
                style={{ background: '#0ea5e9' }}
                disabled={publishing || !content?.id}
                onClick={() => runPublish()}
              >
                {publishing ? 'Publishing…' : 'Publish now or schedule'}
              </button>
            </section>
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
            Browse drafts and completed videos. Open a row to load it on the <strong>Studio</strong> page (steps 1–4) — nothing uploads from here.
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
                <th className="border p-2 text-left w-24"> </th>
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
                  <td className="border p-2 text-sm font-semibold" style={{ color: '#6366f1' }}>
                    Open →
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
            }}
          >
            <div className="flex flex-wrap gap-2 items-end">
              <input type="file" name="file" required />
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
              <li key={a.id} className="border-b pb-2">
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
              </li>
            ))}
          </ul>
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
