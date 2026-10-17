'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import WillieBillyPage from '@/components/willie-billy/WillieBillyNav';
import {
  artStyleForWeek,
  chapterByWeek,
  episodesForWeek,
  findStatus,
  longformBrief,
  weekRangeLabel,
  youtubeTitle,
} from '@/lib/willie-billy/series';

const READY_KEY = 'willie-billy-ready-weeks';

function readReady() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(window.localStorage.getItem(READY_KEY) || '[]');
    return Array.isArray(raw) ? raw.map(Number) : [];
  } catch {
    return [];
  }
}

export default function WillieBillyWeekPage() {
  const params = useParams();
  const week = Number(params.week);
  const chapter = chapterByWeek(week);
  const [copied, setCopied] = useState(null);
  const [ready, setReady] = useState([]);

  useEffect(() => {
    setReady(readReady());
  }, []);

  const episodes = useMemo(() => (chapter ? episodesForWeek(week) : []), [chapter, week]);
  const brief = chapter ? longformBrief(week) : null;
  const range = chapter ? weekRangeLabel(week) : null;

  function toggleReady() {
    const next = ready.includes(week) ? ready.filter((n) => n !== week) : [...ready, week];
    setReady(next);
    window.localStorage.setItem(READY_KEY, JSON.stringify(next));
  }

  async function copyTitle(episode) {
    const title = youtubeTitle(episode);
    try {
      await navigator.clipboard.writeText(title);
      setCopied(episode.episode);
    } catch {
      setCopied(null);
    }
  }

  if (!chapter || !brief || !range) {
    return (
      <WillieBillyPage>
        <p style={{ color: 'var(--color-text-main)' }}>That week is not in the year.</p>
        <Link href="/dashboard/v2/modules/willie-billy/dashboard" className="text-sm" style={{ color: '#1d4ed8' }}>
          Back to the year
        </Link>
      </WillieBillyPage>
    );
  }

  const marked = ready.includes(week);

  return (
    <WillieBillyPage>
      <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
        <Link href="/dashboard/v2/modules/willie-billy/dashboard" style={{ color: '#1d4ed8' }}>
          All chapters
        </Link>
        {week > 1 && (
          <Link href={`/dashboard/v2/modules/willie-billy/weeks/${week - 1}`} style={{ color: 'var(--color-text-muted)' }}>
            Previous
          </Link>
        )}
        {week < 52 && (
          <Link href={`/dashboard/v2/modules/willie-billy/weeks/${week + 1}`} style={{ color: 'var(--color-text-muted)' }}>
            Next
          </Link>
        )}
      </div>

      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] mb-1" style={{ color: '#1d4ed8' }}>
          Chapter {chapter.week} · {range.days} · {range.episodes}
        </p>
        <h1 className="text-3xl font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>{chapter.title}</h1>
        <p className="mb-2" style={{ color: 'var(--color-text-muted)' }}>{chapter.place}</p>
        <p className="text-sm mb-3" style={{ color: 'var(--color-text-main)', maxWidth: 720 }}>{chapter.beat}</p>
        <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
          {artStyleForWeek(week)} · {findStatus(week)} · {episodes.length} shorts, then the chapter
        </p>
        <button
          type="button"
          onClick={toggleReady}
          className="px-3 py-1.5 rounded-lg text-sm font-semibold"
          style={{
            background: marked ? '#dbeafe' : 'var(--color-surface)',
            color: '#1d4ed8',
            border: '1px solid #bfdbfe',
          }}
        >
          {marked ? 'Marked ready on this browser' : 'Mark this week ready'}
        </button>
      </header>

      <section
        className="rounded-2xl p-4 mb-6"
        style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}
      >
        <h2 className="font-semibold mb-1" style={{ color: '#1e3a8a' }}>{brief.title}</h2>
        <p className="text-sm mb-2" style={{ color: '#1e3a8a' }}>{brief.runtime}. {brief.beat}</p>
        <ul className="text-sm space-y-1" style={{ color: '#1e40af' }}>
          {brief.rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </section>

      <div className="space-y-2">
        {episodes.map((episode) => (
          <article
            key={episode.episode}
            className="rounded-xl px-4 py-3"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold" style={{ color: 'var(--color-text-main)' }}>
                Day {episode.day} {episode.slot === 'morning' ? 'Morning' : 'Night'} · {episode.title}
              </h2>
              <span className="text-xs font-semibold" style={{ color: '#1d4ed8' }}>
                Episode {episode.episode} · {episode.format}
              </span>
            </div>
            <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>{episode.happens}</p>
            <button
              type="button"
              onClick={() => copyTitle(episode)}
              className="text-xs mt-2 font-semibold"
              style={{ color: '#1d4ed8' }}
            >
              {copied === episode.episode ? 'Copied' : 'Copy YouTube title'}
            </button>
          </article>
        ))}
      </div>
    </WillieBillyPage>
  );
}
