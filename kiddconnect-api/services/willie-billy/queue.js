/**
 * Queue and daily run for Willie & Billy.
 * Auto mode makes today's two shorts, and the chapter on the last day of the week.
 * It does not go back and make missed days.
 */
import { supabaseClient } from '../../config/database.js';
import { ModuleSettings } from '../../models/v2/ModuleSettings.js';
import {
  calendarDayNumber,
  chapterByWeek,
  episodeByNumber,
  episodesForWeek,
  isLastDayOfWeek,
  todayIso,
  weekForDay,
  youtubeTitle,
} from './catalog.js';
import { renderWillieBilly } from './renderer.js';

const MODULE_KEY = 'willie-billy';
const TABLE = 'willie_billy_renders';
const DEFAULT_TZ = 'America/Toronto';

let working = false;
let missingTableLogged = false;

function isMissingTable(error) {
  const msg = `${error?.message || ''} ${error?.code || ''}`;
  return /willie_billy_renders|PGRST205|42P01|schema cache/i.test(msg);
}

function noteMissing(error) {
  if (!isMissingTable(error)) return false;
  if (!missingTableLogged) {
    missingTableLogged = true;
    console.error('[WillieBilly] Table willie_billy_renders is missing. Run migrations/add_willie_billy_production.sql');
  }
  return true;
}

export function normalizeSchedule(settings) {
  const src = settings && typeof settings === 'object' ? settings : {};
  const dayOne = /^\d{4}-\d{2}-\d{2}$/.test(String(src.day_one || '')) ? src.day_one : null;
  return {
    day_one: dayOne,
    auto_produce: !!src.auto_produce,
    timezone: src.timezone || DEFAULT_TZ,
  };
}

export async function getSchedule(businessId) {
  const row = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
  const schedule = normalizeSchedule(row?.settings);
  const day = schedule.day_one ? calendarDayNumber(schedule.day_one, schedule.timezone) : null;
  return {
    ...schedule,
    today: todayIso(schedule.timezone),
    day_number: day,
    week: day && day >= 1 && day <= 365 ? weekForDay(day) : null,
  };
}

export async function saveSchedule(businessId, patch) {
  const existing = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
  const prev = existing?.settings && typeof existing.settings === 'object' ? existing.settings : {};
  const next = { ...prev };
  if (patch.day_one !== undefined) {
    next.day_one = /^\d{4}-\d{2}-\d{2}$/.test(String(patch.day_one || '')) ? patch.day_one : null;
  }
  if (patch.auto_produce !== undefined) next.auto_produce = !!patch.auto_produce;
  if (patch.timezone) next.timezone = String(patch.timezone);
  await ModuleSettings.update(businessId, MODULE_KEY, next);
  return getSchedule(businessId);
}

async function findShort(businessId, episodeNumber) {
  const { data, error } = await supabaseClient
    .from(TABLE)
    .select('*')
    .eq('business_id', businessId)
    .eq('kind', 'short')
    .eq('episode_number', episodeNumber)
    .maybeSingle();
  if (error) {
    if (noteMissing(error)) return null;
    throw error;
  }
  return data;
}

async function findChapter(businessId, week) {
  const { data, error } = await supabaseClient
    .from(TABLE)
    .select('*')
    .eq('business_id', businessId)
    .eq('kind', 'chapter')
    .eq('week', week)
    .maybeSingle();
  if (error) {
    if (noteMissing(error)) return null;
    throw error;
  }
  return data;
}

async function upsertQueued(existing, payload, { force = false } = {}) {
  const now = new Date().toISOString();
  if (existing?.status === 'rendering') return existing;
  if (existing && !force && existing.status !== 'failed') return existing;
  if (existing) {
    const { data, error } = await supabaseClient
      .from(TABLE)
      .update({
        status: 'queued',
        error: null,
        script: null,
        video_url: force ? null : existing.video_url,
        updated_at: now,
        title: payload.title,
        youtube_title: payload.youtube_title,
      })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabaseClient
    .from(TABLE)
    .insert({ ...payload, status: 'queued', updated_at: now })
    .select()
    .single();
  if (error && error.code === '23505') {
    return payload.kind === 'chapter'
      ? findChapter(payload.business_id, payload.week)
      : findShort(payload.business_id, payload.episode_number);
  }
  if (error) throw error;
  return data;
}

export async function enqueueShort(businessId, episodeNumber, { force = false } = {}) {
  const episode = episodeByNumber(episodeNumber);
  if (!episode) {
    const err = new Error('That episode is not in the year');
    err.status = 400;
    throw err;
  }
  const existing = await findShort(businessId, episode.episode);
  if (existing && !force && existing.status !== 'failed') return existing;
  return upsertQueued(existing, {
    business_id: businessId,
    kind: 'short',
    episode_number: episode.episode,
    week: episode.week,
    day: episode.day,
    slot: episode.slot,
    title: episode.title,
    youtube_title: youtubeTitle(episode),
  }, { force });
}

export async function enqueueChapter(businessId, week, { force = false } = {}) {
  const chapter = chapterByWeek(Number(week));
  if (!chapter) {
    const err = new Error('That week is not in the year');
    err.status = 400;
    throw err;
  }
  const existing = await findChapter(businessId, chapter.week);
  if (existing && !force && existing.status !== 'failed') return existing;
  return upsertQueued(existing, {
    business_id: businessId,
    kind: 'chapter',
    episode_number: null,
    week: chapter.week,
    day: null,
    slot: null,
    title: chapter.title,
    youtube_title: `Chapter ${chapter.week} | ${chapter.title} | Willie & Billy`,
  }, { force });
}

export async function listRenders(businessId, { week, limit = 40 } = {}) {
  let query = supabaseClient
    .from(TABLE)
    .select('id, kind, episode_number, week, day, slot, title, youtube_title, status, video_url, image_url, error, created_at, updated_at')
    .eq('business_id', businessId)
    .order('updated_at', { ascending: false })
    .limit(Math.min(200, Math.max(1, Number(limit) || 40)));
  if (week) query = query.eq('week', Number(week));
  const { data, error } = await query;
  if (error) {
    if (noteMissing(error)) return [];
    throw error;
  }
  return data || [];
}

export async function queueToday(businessId) {
  const schedule = await getSchedule(businessId);
  const day = schedule.day_number;
  if (!schedule.day_one) {
    const err = new Error('Set Day 1 before making today’s shorts');
    err.status = 400;
    throw err;
  }
  if (day < 1 || day > 365) {
    return { schedule, queued: [], skipped: 'outside the cartoon year' };
  }
  const week = weekForDay(day);
  const queued = [];
  for (const episode of episodesForWeek(week)) {
    if (episode.day !== day) continue;
    queued.push(await enqueueShort(businessId, episode.episode));
  }
  if (isLastDayOfWeek(day)) queued.push(await enqueueChapter(businessId, week));
  return { schedule, queued };
}

async function activeBusinessIds() {
  const { data, error } = await supabaseClient
    .from('subscriptions')
    .select('business_id')
    .eq('module_key', MODULE_KEY)
    .eq('status', 'active');
  if (error) throw error;
  return [...new Set((data || []).map((row) => row.business_id).filter(Boolean))];
}

export async function queueDueBusinesses() {
  const ids = await activeBusinessIds();
  let queued = 0;
  for (const businessId of ids) {
    const schedule = await getSchedule(businessId);
    if (!schedule.auto_produce || !schedule.day_one) continue;
    const day = schedule.day_number;
    if (day < 1 || day > 365) continue;
    const open = (await listRenders(businessId, { limit: 20 }))
      .filter((row) => row.status === 'queued' || row.status === 'rendering').length;
    if (open >= 3) continue;
    const result = await queueToday(businessId);
    const fresh = result.queued.filter((row) => {
      const at = new Date(row?.updated_at || row?.created_at || 0).getTime();
      return row?.status === 'queued' && Date.now() - at < 20000;
    });
    queued += fresh.length;
  }
  if (queued > 0) console.log('[WillieBilly] Queued', queued, 'item(s) for the daily run');
  return { businesses: ids.length, queued };
}

async function claimNext() {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  await supabaseClient
    .from(TABLE)
    .update({ status: 'queued', error: 'The last render stopped. Trying again.', updated_at: new Date().toISOString() })
    .eq('status', 'rendering')
    .lt('updated_at', cutoff);

  const { data, error } = await supabaseClient
    .from(TABLE)
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(8);
  if (error) {
    if (noteMissing(error)) return null;
    throw error;
  }
  const rows = data || [];
  rows.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'short' ? -1 : 1;
    return (a.episode_number || 9999) - (b.episode_number || 9999);
  });
  const row = rows[0];
  if (!row) return null;
  const { data: claimed, error: claimError } = await supabaseClient
    .from(TABLE)
    .update({ status: 'rendering', error: null, updated_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('status', 'queued')
    .select()
    .maybeSingle();
  if (claimError) throw claimError;
  return claimed;
}

function attachStory(row) {
  if (row.kind !== 'short') {
    return { ...row, chapter: chapterByWeek(row.week) };
  }
  const episode = episodeByNumber(row.episode_number);
  return {
    ...row,
    format: episode?.format,
    happens: episode?.happens,
    chapter: episode?.chapter || chapterByWeek(row.week),
  };
}

export async function processOneWillieBillyRender() {
  if (working) return { skipped: true };
  working = true;
  let claimed = null;
  try {
    claimed = await claimNext();
    if (!claimed) return { idle: true };
    const story = attachStory(claimed);
    console.log(`[WillieBilly] Rendering ${story.kind} ${story.episode_number || `week ${story.week}`}`);
    const result = await renderWillieBilly(story);
    const { error } = await supabaseClient
      .from(TABLE)
      .update({
        status: 'ready',
        video_url: result.video_url,
        image_url: result.image_url,
        script: result.script,
        youtube_title: result.youtube_title,
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', claimed.id);
    if (error) throw error;
    console.log(`[WillieBilly] Ready ${story.kind} ${story.episode_number || `week ${story.week}`}`);
    return { id: claimed.id, status: 'ready' };
  } catch (err) {
    console.error('[WillieBilly] Render failed:', err.message);
    if (claimed?.id) {
      await supabaseClient
        .from(TABLE)
        .update({
          status: 'failed',
          error: String(err.message || err).slice(0, 800),
          updated_at: new Date().toISOString(),
        })
        .eq('id', claimed.id);
    }
    return { id: claimed?.id || null, status: 'failed' };
  } finally {
    working = false;
  }
}
