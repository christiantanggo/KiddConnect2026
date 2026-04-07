/**
 * Dad Joke Studio — avoid repeating the same joke within a business (library + drafts).
 */
import crypto from 'crypto';
import { supabaseClient } from '../../config/database.js';
import { computeDadJokeFingerprint } from '../orbix-network/dad-joke-generator.js';

const RECENT_ROW_CAP = 400;

function parseContentJson(row) {
  const cj = row?.content_json;
  if (cj && typeof cj === 'object') return cj;
  if (typeof cj === 'string') {
    try {
      return JSON.parse(cj);
    } catch {
      return {};
    }
  }
  return {};
}

function normalizeScriptForFingerprint(text) {
  if (!text || typeof text !== 'string') return '';
  let s = text.trim().toLowerCase().replace(/\s+/g, ' ');
  s = s.replace(/[.,?!;:'"()\-]/g, ' ').replace(/\s+/g, ' ').trim();
  return s;
}

/** All fingerprint keys for a generated shorts payload (pair and/or full script). */
function studioShortsFingerprintKeys(parsed) {
  const keys = new Set();
  const cj = parsed?.content_json && typeof parsed.content_json === 'object' ? parsed.content_json : {};
  const setup = String(parsed?.setup ?? cj.setup ?? '').trim();
  const punchline = String(parsed?.punchline ?? cj.punchline ?? '').trim();
  if (setup && punchline) {
    keys.add(`pair:${computeDadJokeFingerprint(setup, punchline)}`);
  }
  const script = String(parsed?.script_text ?? '').trim();
  if (script) {
    const norm = normalizeScriptForFingerprint(script);
    if (norm) keys.add(`script:${crypto.createHash('sha256').update(norm).digest('hex')}`);
  }
  return keys;
}

function fingerprintKeysFromRow(row) {
  const keys = new Set();
  const cj = parseContentJson(row);
  const setup = String(cj.setup || '').trim();
  const punchline = String(cj.punchline || '').trim();
  if (setup && punchline) {
    keys.add(`pair:${computeDadJokeFingerprint(setup, punchline)}`);
  }
  const script = String(row.script_text || '').trim();
  if (script) {
    const norm = normalizeScriptForFingerprint(script);
    if (norm) keys.add(`script:${crypto.createHash('sha256').update(norm).digest('hex')}`);
  }
  return keys;
}

/**
 * True if another non-deleted shorts row for this business matches any candidate fingerprint.
 */
export async function isStudioShortsDuplicate(businessId, candidateParsed, excludeContentId) {
  if (!businessId || !excludeContentId) return false;
  const cand = studioShortsFingerprintKeys(candidateParsed);
  if (cand.size === 0) return false;

  const { data: rows, error } = await supabaseClient
    .from('dadjoke_studio_generated_content')
    .select('id, content_json, script_text')
    .eq('business_id', businessId)
    .eq('content_type', 'shorts')
    .is('deleted_at', null)
    .neq('id', excludeContentId)
    .order('updated_at', { ascending: false })
    .limit(RECENT_ROW_CAP);

  if (error || !rows?.length) return false;

  for (const row of rows) {
    const existing = fingerprintKeysFromRow(row);
    for (const k of cand) {
      if (existing.has(k)) return true;
    }
  }
  return false;
}

/** Snippets for the model to avoid repeating (same idea as Orbix dad-joke-generator). */
export async function buildRecentStudioShortsPromptBlock(businessId, excludeContentId, lineLimit = 15) {
  if (!businessId || !excludeContentId) return '';
  const { data: rows, error } = await supabaseClient
    .from('dadjoke_studio_generated_content')
    .select('content_json, script_text')
    .eq('business_id', businessId)
    .eq('content_type', 'shorts')
    .is('deleted_at', null)
    .neq('id', excludeContentId)
    .order('updated_at', { ascending: false })
    .limit(80);

  if (error || !rows?.length) return '';
  const lines = [];
  for (const row of rows) {
    if (lines.length >= lineLimit) break;
    const cj = parseContentJson(row);
    if (cj.setup && cj.punchline) {
      lines.push(`- ${String(cj.setup).trim()} → ${String(cj.punchline).trim()}`);
    } else if ((row.script_text || '').trim()) {
      const t = String(row.script_text).trim().replace(/\s+/g, ' ');
      lines.push(t.length > 220 ? `- ${t.slice(0, 220)}…` : `- ${t}`);
    }
  }
  if (!lines.length) return '';
  return `\n\nAlready used in this studio (do NOT repeat or paraphrase these):\n${lines.join('\n')}`;
}
