'use client';

import { useEffect, useState, useCallback, useMemo, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import { useToast } from '@/components/ToastProvider';

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
  const h = { ...getAuthHeaders() };
  const bid = getBusinessId();
  if (bid) h['X-Active-Business-Id'] = bid;
  return h;
}

function isVisualStudioAssetType(t) {
  return ['background', 'thumbnail', 'image'].includes(t);
}

function normalizeDjsFormatKeysClient(raw) {
  if (raw == null) return [];
  let keys = raw;
  if (typeof keys === 'string') {
    try {
      keys = JSON.parse(keys);
    } catch {
      return [];
    }
  }
  if (Array.isArray(keys)) return keys.map((k) => String(k).trim()).filter(Boolean);
  if (typeof keys === 'object') return Object.values(keys).map((k) => String(k).trim()).filter(Boolean);
  return [];
}

/** Single <select> value ↔ API (one list: global, all shorts, each format, all long, each long). */
function djsAssetScopeSelectToApi(val) {
  if (!val || val === 'global') return { usage_scope: 'global', format_keys: [] };
  if (val === 'shorts') return { usage_scope: 'shorts', format_keys: [] };
  if (val === 'long_form') return { usage_scope: 'long_form', format_keys: [] };
  if (val.startsWith('fmt:')) {
    const k = val.slice(4).trim();
    return k ? { usage_scope: 'formats', format_keys: [k] } : { usage_scope: 'global', format_keys: [] };
  }
  if (val.startsWith('__multi:')) {
    const keys = val
      .slice(8)
      .split('|')
      .map((k) => k.trim())
      .filter(Boolean);
    return keys.length ? { usage_scope: 'formats', format_keys: keys } : { usage_scope: 'global', format_keys: [] };
  }
  return { usage_scope: 'global', format_keys: [] };
}

function djsAssetScopeSelectValue(usageScope, formatKeysRaw) {
  const s = String(usageScope || 'global').toLowerCase().trim();
  const keys = [...normalizeDjsFormatKeysClient(formatKeysRaw)].sort();
  if (s === 'global') return 'global';
  if (s === 'shorts') return 'shorts';
  if (s === 'long_form') return 'long_form';
  if (s === 'formats') {
    if (keys.length === 0) return 'global';
    if (keys.length === 1) return `fmt:${keys[0]}`;
    return `__multi:${keys.join('|')}`;
  }
  return 'global';
}

function djsFormatNamesForKeys(keys, shortFormats, longFormats) {
  const all = [...(shortFormats || []), ...(longFormats || [])];
  return keys.map((k) => all.find((f) => f.format_key === k)?.name || k).join(', ');
}

function djsAssetScopeDisplaySummary(usageScope, formatKeysRaw, shortFormats, longFormats) {
  const s = String(usageScope || 'global').toLowerCase().trim();
  const format_keys = normalizeDjsFormatKeysClient(formatKeysRaw);
  if (s === 'global') return 'global';
  if (s === 'shorts') return 'all shorts subcategories';
  if (s === 'long_form') return 'all long form';
  if (s === 'formats' && format_keys.length === 0) return 'formats (none)';
  if (s === 'formats' && format_keys.length === 1) {
    const all = [...(shortFormats || []), ...(longFormats || [])];
    const row = all.find((f) => f.format_key === format_keys[0]);
    return row?.name || format_keys[0];
  }
  if (s === 'formats') return `multiple: ${djsFormatNamesForKeys(format_keys, shortFormats, longFormats)}`;
  return String(usageScope || 'global');
}

function DjsAssetScopeSelectOptions({ shortFormats, longFormats }) {
  return (
    <>
      <option value="global">Global — every video</option>
      <optgroup label="Shorts (vertical)">
        <option value="shorts">All shorts subcategories</option>
        {(shortFormats || []).map((f) => (
          <option key={f.format_key} value={`fmt:${f.format_key}`}>
            {f.name}
          </option>
        ))}
      </optgroup>
      <optgroup label="Long form (horizontal)">
        <option value="long_form">All long form types</option>
        {(longFormats || []).map((f) => (
          <option key={f.format_key} value={`fmt:${f.format_key}`}>
            {f.name}
          </option>
        ))}
      </optgroup>
    </>
  );
}

function isAssetEligibleForVideo(a, contentType, formatKey) {
  if (!a || a.deleted_at || a.enabled === false) return false;
  const scope = String(a.usage_scope || 'global')
    .toLowerCase()
    .trim();
  const fk = formatKey != null ? String(formatKey).trim() : '';
  if (scope === 'global') return true;
  if (scope === 'shorts') return contentType === 'shorts';
  if (scope === 'long_form') return contentType === 'long_form';
  if (scope === 'formats') {
    if (!fk) return false;
    const keys = normalizeDjsFormatKeysClient(a.format_keys);
    return keys.includes(fk);
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

/** Preview + excerpts: show generated script first; summary is metadata, not the spoken script. */
function studioPreviewPrimaryText(content, maxLen = 900) {
  const st = String(content?.script_text || '').trim();
  if (st) return st.length > maxLen ? `${st.slice(0, maxLen)}…` : st;
  const sm = String(content?.summary || '').trim();
  if (sm) return sm.length > maxLen ? `${sm.slice(0, maxLen)}…` : sm;
  return 'Script / storyboard preview for this format.';
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
    for (const raw of [String(content?.script_text || '').trim(), String(content?.summary || '').trim()]) {
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
  const pickUrl = (row) => row?.preview_url || row?.public_url || null;
  const sel = content?.asset_snapshot?.background_asset_id;
  if (sel) {
    const row = sorted.find((a) => String(a.id) === String(sel));
    return pickUrl(row);
  }
  const idx = deterministicAssetIndex(content?.id, sorted.length);
  return pickUrl(sorted[idx]);
}

function wordCountStudio(s) {
  return (String(s || '').trim().split(/\s+/).filter(Boolean).length) || 0;
}

/** Matches `estimateSilentDuration` in dadjoke-studio/renderer.js for preview timing. */
function estimateGenericShortsDurationSec(scriptText, targetSec, maxSec) {
  const w = wordCountStudio(scriptText);
  const fromWords = Math.max(8, Math.ceil(w / 2.4));
  const t = Number(targetSec) || 30;
  const m = Number(maxSec) || 60;
  return Math.min(m, Math.max(6, Math.max(fromWords, t * 0.6)));
}

function sanitizeStudioOnScreenBeatStudio(label, text) {
  let lab = String(label ?? '').trim();
  let txt = String(text ?? '').trim();
  const normLab = lab.replace(/\s+/g, ' ');
  if (/^(text\s*on\s*screen|on-?\s*screen\s*text)(\s*:)?\s*$/i.test(normLab)) lab = '';
  txt = txt.replace(/^\s*(text\s*on\s*screen|on-?\s*screen\s*text)\s*:\s*/i, '').trim();
  return { label: lab, text: txt };
}

function storyboardRowToPhaseStudio(x) {
  const label = String(x?.label ?? '').trim();
  const text = String(x?.text ?? x?.line ?? x?.body ?? x?.copy ?? x?.content ?? '').trim();
  return sanitizeStudioOnScreenBeatStudio(label, text);
}

function escapeRegExpStudio(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Match server `viewerSafeGuessPunchlineContent` — preview shows what the MP4 will show (no answer on screen). */
function viewerSafeGuessPunchlinePreviewContent(content) {
  const cj = parseContentJsonStudio(content);
  const punchline = String(cj.punchline || '').trim();
  if (!punchline) return content;
  const strip = (t) =>
    String(t || '')
      .replace(new RegExp(escapeRegExpStudio(punchline), 'gi'), ' ')
      .replace(/\s+/g, ' ')
      .trim();
  let script_text = strip(content.script_text);
  script_text = sanitizeStudioOnScreenBeatStudio('', script_text).text;
  if (!script_text) script_text = 'Think you know the punchline? Drop it in the comments.';
  const sb = parseStoryboardArrayStudio(content);
  const storyboard_json = sb.map((row) => {
    const label0 = String(row?.label ?? '').trim();
    const raw = String(row?.text ?? '').trim();
    let text = strip(raw);
    const cleaned = sanitizeStudioOnScreenBeatStudio(label0, text);
    let { label, text: t2 } = cleaned;
    if (!t2) t2 = 'COMMENT YOUR PUNCHLINE!';
    return { ...row, label, text: t2 };
  });
  return { ...content, script_text, storyboard_json };
}

/** Match server `rebuildGenericStoryboardFromScript` for live script edits in preview. */
function rebuildGenericStoryboardFromScriptStudio(scriptText) {
  const script = String(scriptText || '').trim();
  if (!script) return [];
  let chunks = script.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  if (chunks.length <= 1) {
    chunks = script
      .split(/(?<=[.!?])\s+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 8);
  }
  if (chunks.length === 0) chunks = [script];
  return chunks.slice(0, 14).map((t) => sanitizeStudioOnScreenBeatStudio('', t));
}

function buildGenericShortsPreviewPhases(content, formatKey) {
  const fk = String(formatKey || '').trim();
  const scriptFirst = fk !== 'shorts_classic_loop';

  if (scriptFirst) {
    const script = String(content?.script_text || '').trim();
    if (script) {
      const fromScript = rebuildGenericStoryboardFromScriptStudio(script).filter((x) => x.text);
      if (fromScript.length > 0) return fromScript;
    }
  }

  const sb = parseStoryboardArrayStudio(content);
  const fromBoard = sb.map(storyboardRowToPhaseStudio).filter((x) => x.text);
  if (fromBoard.length > 0) return fromBoard;

  const script = String(content?.script_text || '').trim();
  if (!script) {
    return [{ label: '', text: 'Generate a script to see timed preview beats.' }];
  }
  const fromFallback = rebuildGenericStoryboardFromScriptStudio(script).filter((x) => x.text);
  return fromFallback.length > 0 ? fromFallback : [{ label: '', text: 'Generate a script to see timed preview beats.' }];
}

/** Approximate Orbix 4-segment motion (zoom / pan / zoom / pan) like `applyMotionToImage`. */
function kenBurnsTransformGeneric(tMs, totalMs) {
  if (totalMs <= 0) return 'translate(-50%, -50%) scale(1.1)';
  const p = ((tMs % totalMs) / totalMs) * 4;
  const seg = Math.min(3, Math.floor(p));
  const u = p - seg;
  let scale = 1.08;
  let tx = 0;
  let ty = 0;
  if (seg === 0) scale = 1.08 + 0.1 * u;
  else if (seg === 1) {
    scale = 1.18;
    tx = -5 * u;
    ty = 1.5 * u;
  } else if (seg === 2) scale = 1.18 - 0.1 * u;
  else {
    scale = 1.08;
    tx = 5 * u;
    ty = -1.5 * u;
  }
  return `translate(calc(-50% + ${tx}%), calc(-50% + ${ty}%)) scale(${scale})`;
}

function DadJokeGenericShortsPreview({ aspectRatio, content, eligibleBackgroundAssets, currentFormat, musicNote, formatKey }) {
  const contentForPreview = useMemo(
    () =>
      formatKey === 'shorts_guess_punchline'
        ? viewerSafeGuessPunchlinePreviewContent(content)
        : content,
    [content, formatKey]
  );
  const bgUrl = useMemo(
    () => resolveClassicPreviewBackgroundUrl(content, eligibleBackgroundAssets),
    [content?.id, content?.asset_snapshot?.background_asset_id, eligibleBackgroundAssets]
  );
  const phases = useMemo(
    () => buildGenericShortsPreviewPhases(contentForPreview, formatKey),
    [contentForPreview, formatKey]
  );
  const durationSec = useMemo(() => {
    const script = String(contentForPreview?.script_text || '').trim();
    const target = Number(currentFormat?.target_duration_sec) || 30;
    const maxD = Number(currentFormat?.max_duration_sec) || 60;
    if (!script) return Math.min(maxD, Math.max(10, target));
    return estimateGenericShortsDurationSec(script, target, maxD);
  }, [contentForPreview?.script_text, currentFormat?.target_duration_sec, currentFormat?.max_duration_sec]);

  const totalMs = Math.max(4000, Math.round(durationSec * 1000));
  const [tMs, setTMs] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let rafId = 0;
    const start = performance.now();
    function frame() {
      if (cancelled) return;
      const elapsed = (performance.now() - start) % totalMs;
      setTMs(elapsed);
      rafId = requestAnimationFrame(frame);
    }
    rafId = requestAnimationFrame(frame);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [content?.id, totalMs, formatKey]);

  const barPct = (tMs / totalMs) * 100;
  const n = phases.length;
  const phaseIdx = n > 0 ? Math.min(n - 1, Math.floor((tMs / totalMs) * n)) : 0;
  const beat = phases[phaseIdx] || { label: '', text: '' };
  const motionStyle = kenBurnsTransformGeneric(tMs, totalMs);

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
        <div className="absolute inset-0 overflow-hidden">
          {bgUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={bgUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="absolute left-1/2 top-1/2 min-h-[115%] min-w-[115%] max-w-none object-cover"
                style={{ transform: motionStyle, transformOrigin: 'center center' }}
              />
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.65) 100%)' }}
              />
            </>
          ) : (
            <div
              className="absolute inset-0 flex items-center justify-center text-[11px] px-4 text-center"
              style={{ color: 'rgba(248,250,252,0.65)' }}
            >
              No eligible background — add one under Assets to match the render.
            </div>
          )}
        </div>
        <div className="relative z-10 flex flex-col flex-1 min-h-[200px]">
          <div className="flex-1 flex flex-col items-center justify-center px-4 py-5 text-center min-h-[160px]">
            {beat.label ? (
              <p className="text-[10px] uppercase tracking-[0.2em] opacity-75 mb-2" style={{ textShadow: '0 1px 8px rgba(0,0,0,0.9)' }}>
                {stripEmojiStudio(beat.label)}
              </p>
            ) : null}
            <p
              className="text-sm sm:text-base font-semibold leading-snug max-w-[95%] line-clamp-[8]"
              style={{ textShadow: '0 2px 14px rgba(0,0,0,0.95)' }}
            >
              {stripEmojiStudio(beat.text)}
            </p>
            <p className="text-[10px] mt-3 opacity-70 tabular-nums" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.9)' }}>
              Beat {phaseIdx + 1} of {n} · ~{durationSec}s loop (est. render length)
            </p>
          </div>
          <div className="px-[5%] pb-4 pt-1">
            <div className="h-3 w-full rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.15)' }}>
              <div
                className="h-full rounded-full transition-none"
                style={{ width: `${Math.min(100, barPct)}%`, background: 'rgba(255,255,255,0.9)' }}
              />
            </div>
            <p className="text-[10px] mt-2 text-center opacity-80" style={{ color: 'rgba(248,250,252,0.75)' }}>
              Motion matches the render. The exported MP4 burns in these beats (timed by word weight) plus voiceover and optional music.
            </p>
          </div>
        </div>
      </div>
      {musicNote ? (
        <p className="text-[10px] mt-1 text-center" style={{ color: 'var(--color-text-muted)' }}>
          {musicNote}
        </p>
      ) : null}
      {formatKey === 'shorts_guess_punchline' ? (() => {
        const ans = String(parseContentJsonStudio(content).punchline || '').trim();
        if (!ans) return null;
        return (
          <p
            className="text-[10px] mt-2 mx-auto max-w-lg px-3 py-2 rounded-lg text-center"
            style={{ background: 'rgba(251, 191, 36, 0.12)', border: '1px solid rgba(251, 191, 36, 0.35)', color: '#92400e' }}
          >
            <span className="font-semibold">Answer (not spoken or burned into the video):</span>{' '}
            {stripEmojiStudio(ans)}
          </p>
        );
      })() : null}
    </div>
  );
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
            No eligible background for this draft — upload under Assets (e.g. all shorts subcategories) or pick one above.
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
  const { success: showPublishSuccess } = useToast();
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
  const [uploadScopeSelect, setUploadScopeSelect] = useState('global');
  const [uploadImagePreviewUrl, setUploadImagePreviewUrl] = useState(null);
  const [suggestingYoutubeMeta, setSuggestingYoutubeMeta] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishSuccessHint, setPublishSuccessHint] = useState(null);
  const [approving, setApproving] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [cancellingRender, setCancellingRender] = useState(false);

  const publishPollRef = useRef(null);
  const libFilterRef = useRef(libFilter);
  const contentIdRef = useRef(null);

  useEffect(() => {
    libFilterRef.current = libFilter;
  }, [libFilter]);

  useEffect(() => {
    contentIdRef.current = content?.id ?? null;
  }, [content?.id]);

  useEffect(
    () => () => {
      if (publishPollRef.current != null) {
        clearInterval(publishPollRef.current);
        publishPollRef.current = null;
      }
    },
    []
  );

  const clearPublishPoll = useCallback(() => {
    if (publishPollRef.current != null) {
      clearInterval(publishPollRef.current);
      publishPollRef.current = null;
    }
  }, []);

  const refreshLibrary = useCallback(async () => {
    const f = libFilterRef.current;
    const q = new URLSearchParams();
    if (f.content_type) q.set('content_type', f.content_type);
    if (f.format_key) q.set('format_key', f.format_key);
    if (f.status) q.set('status', f.status);
    try {
      const res = await fetch(`${API}/api/v2/dad-joke-studio/content?${q}`, { headers: buildHeaders() });
      const d = await res.json();
      setLibrary(d.items || []);
    } catch {
      /* ignore */
    }
  }, []);

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
      const [soR, libR, astR, ytR] = await Promise.all([
        fetchJson(`${API}/api/v2/dad-joke-studio/style-options`),
        fetchJson(`${API}/api/v2/dad-joke-studio/content`),
        fetchJson(`${API}/api/v2/dad-joke-studio/assets`),
        fetchJson(`${API}/api/v2/dad-joke-studio/youtube/status`),
      ]);
      if (!soR.ok) throw new Error(soR.data?.error || `Style options failed (${soR.status})`);
      if (!libR.ok) throw new Error(libR.data?.error || `Library failed (${libR.status})`);
      if (!astR.ok) throw new Error(astR.data?.error || `Assets failed (${astR.status})`);
      setStyleCategories(soR.data.categories || {});
      setLibrary(libR.data.items || []);
      setAssets(astR.data.assets || []);
      setYtStatus(ytR.ok ? ytR.data : { connected: false, connected_manual: false });
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
    if (mainSection !== 'library') return;
    refreshLibrary();
  }, [mainSection, refreshLibrary]);

  useEffect(() => {
    if (mainSection !== 'library') return;
    const busy = library.some((r) => ['UPLOADING', 'UPLOAD_QUEUED'].includes(r.status));
    if (!busy) return;
    const t = setInterval(() => {
      refreshLibrary();
    }, 4000);
    return () => clearInterval(t);
  }, [mainSection, library, refreshLibrary]);

  useEffect(() => {
    const sec = searchParams.get('studioSection');
    if (sec) setMainSection(sec === 'upload' ? 'studio' : sec);
    if (accessAllowed === true && searchParams.get('youtube_connected') === 'true') loadAll();
  }, [searchParams, loadAll, accessAllowed]);

  useEffect(() => {
    if (!pollRender || !content?.id) return;
    const id = content.id;
    const t = setInterval(() => {
      void (async () => {
        try {
          const res = await fetch(`${API}/api/v2/dad-joke-studio/content/${id}/render-status`, {
            headers: buildHeaders(),
          });
          if (!res.ok) return;
          const data = await res.json().catch(() => ({}));
          if (data.render?.render_status === 'READY' || data.render?.render_status === 'FAILED') {
            clearInterval(t);
            setPollRender(null);
            setCurrentRender(data.render || null);
            try {
              const fullRes = await fetch(`${API}/api/v2/dad-joke-studio/content/${id}`, {
                headers: buildHeaders(),
              });
              if (fullRes.ok) {
                const full = await fullRes.json().catch(() => ({}));
                if (full.item) setContent(full.item);
                if (full.current_render) setCurrentRender(full.current_render);
              }
            } catch {
              /* ignore */
            }
            try {
              await loadAll();
            } catch {
              /* ignore */
            }
          }
        } catch {
          /* API down or offline — keep polling until reachable or user leaves */
        }
      })();
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
    if (!content?.id) return null;
    try {
      const res = await fetch(`${API}/api/v2/dad-joke-studio/content/${content.id}`, {
        method: 'PUT',
        headers: buildHeaders(),
        body: JSON.stringify(patch),
      });
      let data = {};
      try {
        data = await res.json();
      } catch {
        /* non-JSON body */
      }
      if (!res.ok) {
        setError(data?.error || `Save failed (${res.status}).`);
        return null;
      }
      setContent(data.item);
      return data.item;
    } catch (e) {
      const msg = String(e?.message || '');
      setError(
        msg.includes('Failed to fetch') || msg.includes('NetworkError')
          ? `Cannot reach API at ${API}. Check NEXT_PUBLIC_API_URL or that the server is running.`
          : msg || 'Save failed.'
      );
      return null;
    }
  }

  async function selectStudioFormat(f) {
    if (studioTop === 'shorts') setShortKey(f.format_key);
    else setLongKey(f.format_key);
    if (content?.id && content.content_type === f.content_type && content.format_key !== f.format_key) {
      await saveContent({ format_key: f.format_key });
    }
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
    if (['RENDERING', 'UPLOADING', 'UPLOAD_QUEUED'].includes(row.status)) {
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
    if (!content?.id || rendering) return;
    if (!String(content.script_text || '').trim()) {
      setError('Script is empty — add or generate script text before rendering.');
      return;
    }
    if (content.status === 'RENDERING') {
      setError('A render is already in progress for this draft. Wait for the preview or refresh the page.');
      return;
    }
    setError(null);
    setRendering(true);
    try {
      const savePatch = {
        script_text: content.script_text,
        ai_prompt: content.ai_prompt,
      };
      if (studioTop === 'long_form' && longKey === 'long_style_engine') {
        savePatch.style_recipe_snapshot = recipe;
      }
      const saved = await saveContent(savePatch);
      if (!saved) return;

      if (saved.status === 'RENDERING') {
        setError('A render is already in progress for this draft. Wait for the preview or refresh the page.');
        return;
      }
      if (
        saved.status !== 'APPROVED' &&
        saved.status !== 'FAILED' &&
        saved.status !== 'RENDERED'
      ) {
        setError(
          'Approve this draft first (step 2), then render. If you edited the script after approving, the draft was reset to DRAFT — approve again.'
        );
        return;
      }

      const res = await fetch(`${API}/api/v2/dad-joke-studio/content/${saved.id}/render`, {
        method: 'POST',
        headers: buildHeaders(),
      });
      let data = {};
      try {
        data = await res.json();
      } catch {
        /* non-JSON body */
      }
      if (!res.ok) {
        setError(
          data?.error ||
            (res.status === 0
              ? `Cannot reach API (${API}). Start the backend or check the port in config.`
              : `Render failed (${res.status}).`)
        );
        return;
      }
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
    } catch (e) {
      const msg = String(e?.message || '');
      setError(
        msg.includes('Failed to fetch') || msg.includes('NetworkError')
          ? `Cannot reach API at ${API}. Is the server running (e.g. localhost:5003)?`
          : msg || 'Render failed.'
      );
    } finally {
      setRendering(false);
    }
  }

  async function cancelRender() {
    if (!content?.id || cancellingRender) return;
    setCancellingRender(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/v2/dad-joke-studio/content/${content.id}/cancel-render`, {
        method: 'POST',
        headers: buildHeaders(),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || `Cancel failed (${res.status}).`);
        return;
      }
      setPollRender(false);
      if (d.item) setContent(d.item);
      setCurrentRender(null);
      await loadAll();
    } catch (e) {
      const msg = String(e?.message || '');
      setError(
        msg.includes('Failed to fetch') || msg.includes('NetworkError')
          ? `Cannot reach API at ${API}. Is the server running?`
          : msg || 'Cancel failed.'
      );
    } finally {
      setCancellingRender(false);
    }
  }

  async function runPublish() {
    if (!content?.id) {
      setError('Open a draft from Studio or Library first.');
      return;
    }
    const renderedOutputId =
      content.current_render_id ||
      (currentRender?.render_status === 'READY' && currentRender?.id ? currentRender.id : null);
    if (!renderedOutputId) {
      setError(
        'No finished render linked to this draft. Go to Studio → Approve → Render video, wait until the preview appears, then try again.'
      );
      return;
    }
    setError(null);
    setPublishSuccessHint(null);
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
        setError(`Publish failed (${res.status}). Check the API URL or try again.`);
        return;
      }
      if (!res.ok) {
        setError(data?.error || `Publish failed (${res.status})`);
        return;
      }
      const isScheduled = Boolean(uploadForm.schedule?.trim());
      showPublishSuccess(
        isScheduled
          ? 'Scheduled. Your video will go live on YouTube at the time you chose.'
          : 'Queued for YouTube. The upload runs in the background—check the Library in a minute for status.'
      );
      setPublishSuccessHint(
        isScheduled
          ? 'Scheduled — YouTube will publish at your chosen time.'
          : 'Queued — uploading to YouTube in the background. Check Library for status.'
      );
      const generatedContentId = content.id;
      await loadAll();
      try {
        const refresh = await fetch(`${API}/api/v2/dad-joke-studio/content/${generatedContentId}`, { headers: buildHeaders() });
        const rd = await refresh.json().catch(() => ({}));
        if (refresh.ok && rd.item) setContent(rd.item);
        if (refresh.ok && rd.current_render) setCurrentRender(rd.current_render);
      } catch {
        /* non-fatal */
      }
      const publishId = data.publish?.id;
      clearPublishPoll();
      if (publishId) {
        const started = Date.now();
        publishPollRef.current = setInterval(async () => {
          if (Date.now() - started > 180000) {
            clearPublishPoll();
            return;
          }
          try {
            const stRes = await fetch(`${API}/api/v2/dad-joke-studio/publish-queue/${publishId}/status`, {
              headers: buildHeaders(),
            });
            const stData = await stRes.json().catch(() => ({}));
            const ps = stData.publish?.publish_status;
            await refreshLibrary();
            if (contentIdRef.current === generatedContentId) {
              const fullRes = await fetch(`${API}/api/v2/dad-joke-studio/content/${generatedContentId}`, {
                headers: buildHeaders(),
              });
              const full = await fullRes.json().catch(() => ({}));
              if (full.item) setContent(full.item);
              if (full.current_render) setCurrentRender(full.current_render);
            }
            if (ps && ['PUBLISHED', 'SCHEDULED', 'FAILED'].includes(ps)) {
              clearPublishPoll();
              await loadAll();
            }
          } catch {
            /* ignore */
          }
        }, 3000);
      }
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

  const shortFormats = useMemo(
    () =>
      (formats || []).filter((f) => f.content_type === 'shorts' && f.format_key !== 'shorts_micro_story'),
    [formats]
  );
  const longFormats = useMemo(
    () => (formats || []).filter((f) => f.content_type === 'long_form'),
    [formats]
  );

  useEffect(() => {
    if (shortKey !== 'shorts_micro_story') return;
    const next = shortFormats[0]?.format_key || 'shorts_classic_loop';
    setShortKey(next);
  }, [shortKey, shortFormats]);

  /**
   * Eligible assets follow the **selected** Shorts/Long tab + format pill when the open draft is the
   * same bucket (e.g. shorts). Otherwise we’d show Classic Loop in the DB while the UI says “Vs” and
   * format-scoped uploads would disappear; render also used the wrong format_key until saved.
   */
  const assetEligibilityContext = useMemo(() => {
    const tabContentType = studioTop === 'long_form' ? 'long_form' : 'shorts';
    const tabFormatKey = studioTop === 'long_form' ? longKey : shortKey;
    if (!content?.id) {
      return { contentType: tabContentType, formatKey: tabFormatKey };
    }
    if (content.content_type === tabContentType) {
      return { contentType: tabContentType, formatKey: tabFormatKey };
    }
    // Shorts draft while Long tab is selected (or the reverse): use the draft’s format, not the wrong tab’s pill.
    const savedFk = content.format_key && String(content.format_key).trim();
    if (savedFk) {
      return { contentType: content.content_type, formatKey: savedFk };
    }
    const firstOfType =
      content.content_type === 'shorts' ? shortFormats[0] : longFormats[0];
    return {
      contentType: content.content_type,
      formatKey: firstOfType?.format_key || tabFormatKey,
    };
  }, [content?.id, content?.content_type, content?.format_key, studioTop, shortKey, longKey, shortFormats, longFormats]);

  const eligibleBackgroundAssets = useMemo(() => {
    const { contentType: ct, formatKey: fk } = assetEligibilityContext;
    if (!fk) return [];
    return assets.filter(
      (a) =>
        ['background', 'image', 'thumbnail'].includes(a.asset_type) && isAssetEligibleForVideo(a, ct, fk)
    );
  }, [assets, assetEligibilityContext]);

  const backgroundEligibilityHint = useMemo(() => {
    const { contentType: ct, formatKey: fk } = assetEligibilityContext;
    const visual = assets.filter(
      (a) =>
        ['background', 'image', 'thumbnail'].includes(a.asset_type) && !a.deleted_at && a.enabled !== false
    );
    if (visual.length === 0) {
      return 'Upload an image with type “background” or “image” (thumbnail works too). Music files cannot be used as the video background.';
    }
    const onlyFormats = visual.filter((a) => String(a.usage_scope || '').toLowerCase().trim() === 'formats');
    const fkStr = fk || '—';
    if (onlyFormats.length === visual.length && onlyFormats.length > 0) {
      return `All ${visual.length} image asset(s) are scoped to specific subcategories only. In Assets, either check the box for this format (${fkStr}), or change scope to “All shorts subcategories” / “Global”.`;
    }
    return `${visual.length} image asset(s) in the library, but none match ${ct === 'shorts' ? 'Shorts' : 'long form'} / format “${fkStr}”. Wrong tab (Long vs Shorts) or scope (e.g. Long form only) will hide backgrounds here.`;
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
        <strong> Assets</strong> is for backgrounds/music. YouTube OAuth lives in{' '}
        <Link href="/dashboard/v2/modules/dad-joke-studio/settings" className="underline">Settings</Link>.
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
                onClick={() => void selectStudioFormat(f)}
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
                  <p className="text-amber-800 text-[11px] whitespace-pre-wrap">{backgroundEligibilityHint}</p>
                )}
              </div>
              {formatKey === 'shorts_classic_loop' ? (
                <DadJokeClassicLoopPreview
                  aspectRatio={previewAspect}
                  content={content}
                  eligibleBackgroundAssets={eligibleBackgroundAssets}
                  musicNote={classicLoopMusicNote}
                />
              ) : studioTop === 'shorts' ? (
                <DadJokeGenericShortsPreview
                  aspectRatio={previewAspect}
                  content={content}
                  eligibleBackgroundAssets={eligibleBackgroundAssets}
                  currentFormat={currentFormat}
                  musicNote={classicLoopMusicNote}
                  formatKey={formatKey}
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
                  <span className="whitespace-pre-wrap text-left block px-1">{studioPreviewPrimaryText(content)}</span>
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
                      Scroll down to <strong>YouTube metadata</strong> and <strong>Publish</strong> on this same page — your video stays in context.
                    </p>
                    <button
                      type="button"
                      className="px-4 py-2 rounded-lg text-sm font-semibold text-white shrink-0"
                      style={{ background: '#0ea5e9' }}
                      onClick={() => document.getElementById('djs-metadata')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    >
                      Go to metadata →
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
                  className="px-2 py-1 text-xs border rounded disabled:opacity-50"
                  onClick={async () => {
                    if (!content?.id || approving) return;
                    setApproving(true);
                    setError(null);
                    try {
                      const r = await fetch(`${API}/api/v2/dad-joke-studio/content/${content.id}/approve`, {
                        method: 'POST',
                        headers: buildHeaders(),
                      });
                      const d = await r.json().catch(() => ({}));
                      if (!r.ok) {
                        setError(
                          d.error ||
                            (r.status === 0
                              ? `Cannot reach API (${API}). Start the backend or check the port.`
                              : `Approve failed (${r.status}).`)
                        );
                        return;
                      }
                      if (d.item) setContent(d.item);
                      await loadAll();
                    } catch (e) {
                      const msg = String(e?.message || '');
                      setError(
                        msg.includes('Failed to fetch') || msg.includes('NetworkError')
                          ? `Cannot reach API at ${API}. Is the server running?`
                          : msg || 'Approve failed.'
                      );
                    } finally {
                      setApproving(false);
                    }
                  }}
                  disabled={!content?.id || approving}
                >
                  {approving ? 'Approving…' : 'Approve'}
                </button>
                <button
                  type="button"
                  className="px-2 py-1 text-xs rounded text-white disabled:opacity-50"
                  style={{ background: '#10b981' }}
                  onClick={() => void runRender()}
                  disabled={!content?.id || rendering || content?.status === 'RENDERING' || cancellingRender}
                  title="Starts a new FFmpeg job on the server. Use after deploy or script changes so the file matches latest code and data."
                >
                  {rendering
                    ? 'Starting…'
                    : content?.status === 'RENDERED' || currentRender?.render_status === 'READY'
                      ? 'Re-render video'
                      : 'Render video'}
                </button>
                <button
                  type="button"
                  className="px-2 py-1 text-xs rounded border border-amber-700 text-amber-900 dark:text-amber-200 disabled:opacity-50"
                  style={{ background: 'var(--color-surface, #fff8e7)' }}
                  onClick={() => void cancelRender()}
                  disabled={!content?.id || content?.status !== 'RENDERING' || cancellingRender || rendering}
                  title="Stop a stuck render and return the draft to Approved so you can render again."
                >
                  {cancellingRender ? 'Cancelling…' : 'Cancel render'}
                </button>
              </div>
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
              {publishSuccessHint && (
                <p
                  className="text-sm mt-3 rounded-lg p-3 border"
                  style={{ background: '#ecfdf5', color: '#065f46', borderColor: '#a7f3d0' }}
                  role="status"
                >
                  {publishSuccessHint}
                </p>
              )}
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
            Browse drafts and completed videos. Open a row to load it on the <strong>Studio</strong> page (steps 1–4). Nothing uploads to YouTube from here. Use <strong>Delete</strong> to remove an item (blocked while a render or YouTube upload is running).
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            <select className="border rounded p-1 text-sm" value={libFilter.content_type} onChange={(e) => setLibFilter((f) => ({ ...f, content_type: e.target.value }))}>
              <option value="">All types</option>
              <option value="shorts">Shorts</option>
              <option value="long_form">Long form</option>
            </select>
            <input className="border rounded p-1 text-sm" placeholder="format_key" value={libFilter.format_key} onChange={(e) => setLibFilter((f) => ({ ...f, format_key: e.target.value }))} />
            <input className="border rounded p-1 text-sm" placeholder="status" value={libFilter.status} onChange={(e) => setLibFilter((f) => ({ ...f, status: e.target.value }))} />
            <button type="button" className="px-2 py-1 text-xs border rounded" onClick={() => refreshLibrary()}>
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
                          ['RENDERING', 'UPLOADING', 'UPLOAD_QUEUED'].includes(row.status)
                            ? 'Wait for render or upload to finish'
                            : 'Remove from library'
                        }
                        disabled={['RENDERING', 'UPLOADING', 'UPLOAD_QUEUED'].includes(row.status)}
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
            Choose scope in the list: <strong>Global</strong>, <strong>all shorts</strong> or <strong>one shorts type</strong> (Classic loop, Vs, Guess the punchline…), same for long form, or one long format. If an older asset used several types at once, the menu shows that combined row until you pick a single scope.
            Renders never pull Orbix stock backgrounds/music.
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
              const { usage_scope, format_keys } = djsAssetScopeSelectToApi(uploadScopeSelect);
              if (usage_scope === 'formats' && format_keys.length === 0) {
                setError('Pick a valid scope from the list.');
                return;
              }
              const h = { Authorization: getAuthHeaders().Authorization };
              const bid = getBusinessId();
              if (bid) h['X-Active-Business-Id'] = bid;
              const up = new FormData();
              up.append('file', file);
              up.append('asset_type', fd.get('asset_type'));
              up.append('usage_scope', usage_scope);
              up.append('format_keys', JSON.stringify(format_keys));
              const res = await fetch(`${API}/api/v2/dad-joke-studio/assets`, { method: 'POST', headers: h, body: up });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) {
                setError(data?.error || `Upload failed (${res.status})`);
                return;
              }
              loadAll();
              e.target.reset();
              setUploadScopeSelect('global');
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
                  <select
                    className="border rounded p-1 max-w-[min(100%,min(28rem,100%))] w-full sm:w-auto min-w-[12rem]"
                    value={uploadScopeSelect}
                    onChange={(e) => setUploadScopeSelect(e.target.value)}
                  >
                    <DjsAssetScopeSelectOptions shortFormats={shortFormats} longFormats={longFormats} />
                  </select>
                  <button type="submit" className="px-3 py-1 rounded text-white text-sm" style={{ background: '#6366f1' }}>Upload</button>
                </div>
              </div>
            </div>
          </form>
          <ul className="text-sm space-y-3">
            {assets.map((a) => {
              const assetSel = djsAssetScopeSelectValue(a.usage_scope, a.format_keys);
              const multiKeys =
                assetSel.startsWith('__multi:') ? assetSel.slice(8).split('|').filter(Boolean) : [];
              return (
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
                    <span className="text-xs ml-2 opacity-70">
                      ({djsAssetScopeDisplaySummary(a.usage_scope, a.format_keys, shortFormats, longFormats)})
                    </span>
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
                    className="border rounded p-1 max-w-[min(100%,min(28rem,100%))] w-full sm:w-auto min-w-[12rem]"
                    value={assetSel}
                    onChange={async (e) => {
                      const v = e.target.value;
                      if (v === assetSel) return;
                      const { usage_scope, format_keys } = djsAssetScopeSelectToApi(v);
                      try {
                        setError(null);
                        await patchAsset(a.id, { usage_scope, format_keys });
                      } catch (err) {
                        setError(err.message);
                      }
                    }}
                  >
                    {multiKeys.length > 1 ? (
                      <option value={assetSel}>
                        Multiple types: {djsFormatNamesForKeys(multiKeys, shortFormats, longFormats)}
                      </option>
                    ) : null}
                    <DjsAssetScopeSelectOptions shortFormats={shortFormats} longFormats={longFormats} />
                  </select>
                </div>
                </div>
              </li>
              );
            })}
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
