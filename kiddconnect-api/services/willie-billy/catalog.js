/**
 * Lookups on top of the year bible. The bible file stays data-only.
 */
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import {
  chapterByWeek,
  episodesForWeek,
  daysInWeek,
  startDay,
} from './series.js';

export {
  chapterByWeek,
  episodesForWeek,
  youtubeTitle,
  artStyleForWeek,
  daysInWeek,
  startDay,
  longformBrief,
  findStatus,
  SERIES,
} from './series.js';

export function weekForDay(day) {
  const n = Number(day);
  if (n >= 358) return 52;
  if (n < 1) return null;
  return Math.ceil(n / 7);
}

export function episodeByNumber(episodeNumber) {
  const n = Number(episodeNumber);
  if (!Number.isInteger(n) || n < 1 || n > 730) return null;
  for (let week = 1; week <= 52; week += 1) {
    const hit = episodesForWeek(week).find((ep) => ep.episode === n);
    if (hit) return { ...hit, chapter: chapterByWeek(week) };
  }
  return null;
}

export function isLastDayOfWeek(day) {
  const week = weekForDay(day);
  if (!week) return false;
  const last = startDay(week) + daysInWeek(week) - 1;
  return Number(day) === last;
}

export function calendarDayNumber(dayOne, timeZone, now = new Date()) {
  if (!dayOne || !/^\d{4}-\d{2}-\d{2}$/.test(String(dayOne))) return null;
  const today = format(toZonedTime(now, timeZone || 'America/Toronto'), 'yyyy-MM-dd');
  const [ys, ms, ds] = String(dayOne).split('-').map(Number);
  const [yt, mt, dt] = today.split('-').map(Number);
  const diff = Math.round((Date.UTC(yt, mt - 1, dt) - Date.UTC(ys, ms - 1, ds)) / 86400000);
  return diff + 1;
}

export function todayIso(timeZone, now = new Date()) {
  return format(toZonedTime(now, timeZone || 'America/Toronto'), 'yyyy-MM-dd');
}
