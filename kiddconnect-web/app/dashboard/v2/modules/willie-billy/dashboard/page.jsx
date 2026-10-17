'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import WillieBillyPage from '@/components/willie-billy/WillieBillyNav';
import {
  CHAPTERS,
  SEASONS,
  SERIES,
  artStyleForWeek,
  findStatus,
  searchSeries,
  weekRangeLabel,
} from '@/lib/willie-billy/series';
import { getWillieSchedule } from '@/lib/willie-billy/client';

export default function WillieBillyDashboard() {
  const [season, setSeason] = useState(0);
  const [query, setQuery] = useState('');
  const [schedule, setSchedule] = useState(null);

  useEffect(() => {
    getWillieSchedule().then((res) => setSchedule(res.schedule)).catch(() => {});
  }, []);

  const visible = useMemo(() => {
    if (!season) return CHAPTERS;
    return CHAPTERS.filter((c) => c.season === season);
  }, [season]);

  const results = useMemo(() => searchSeries(query), [query]);
  const searching = query.trim().length > 0;

  return (
    <WillieBillyPage>
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] mb-2" style={{ color: '#1d4ed8' }}>
          Series bible
        </p>
        <h1 className="text-3xl font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>
          {SERIES.title}
        </h1>
        <p className="text-base leading-relaxed" style={{ color: 'var(--color-text-muted)', maxWidth: 720 }}>
          {SERIES.logline}
        </p>
      </header>

      <Link
        href="/dashboard/v2/modules/willie-billy/settings"
        className="block rounded-xl px-4 py-3 mb-6 text-sm"
        style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e3a8a' }}
      >
        {schedule?.auto_produce && schedule?.day_number >= 1 && schedule?.day_number <= 365
          ? `Daily run is on. Today is Day ${schedule.day_number}, chapter ${schedule.week}.`
          : 'Production is ready. Set Day 1 and turn on the daily run.'}
      </Link>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        {[
          ['365', 'Days'],
          ['730', 'Shorts'],
          ['52', 'Chapters'],
        ].map(([n, label]) => (
          <div
            key={label}
            className="rounded-xl px-4 py-3"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <div className="text-2xl font-semibold" style={{ color: '#1d4ed8' }}>{n}</div>
            <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{label}</div>
          </div>
        ))}
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search a day, episode, place, or name — try 140, Piper, porch"
        className="w-full mb-4 px-4 py-2.5 rounded-xl text-sm"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text-main)',
        }}
      />

      {searching ? (
        <SearchResults results={results} />
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            <SeasonChip active={season === 0} onClick={() => setSeason(0)}>All year</SeasonChip>
            {SEASONS.map((s) => (
              <SeasonChip key={s.id} active={season === s.id} onClick={() => setSeason(s.id)}>
                {s.name}
              </SeasonChip>
            ))}
          </div>
          {season !== 0 && (
            <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
              {SEASONS.find((s) => s.id === season)?.summary}
            </p>
          )}
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {visible.map((chapter) => {
              const range = weekRangeLabel(chapter.week);
              return (
                <Link
                  key={chapter.week}
                  href={`/dashboard/v2/modules/willie-billy/weeks/${chapter.week}`}
                  className="rounded-2xl p-4 block"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-semibold" style={{ color: '#1d4ed8' }}>
                      Chapter {chapter.week}
                    </span>
                    {chapter.find ? (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: '#dbeafe', color: '#1d4ed8' }}>
                        Find {chapter.find}
                      </span>
                    ) : null}
                  </div>
                  <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--color-text-main)' }}>
                    {chapter.title}
                  </h2>
                  <p className="text-sm mb-2" style={{ color: 'var(--color-text-muted)' }}>{chapter.place}</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {range.days} · {artStyleForWeek(chapter.week)}
                  </p>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </WillieBillyPage>
  );
}

function SeasonChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 rounded-full text-sm font-semibold"
      style={{
        background: active ? '#1d4ed8' : 'var(--color-surface)',
        color: active ? '#fff' : 'var(--color-text-main)',
        border: '1px solid var(--color-border)',
      }}
    >
      {children}
    </button>
  );
}

function SearchResults({ results }) {
  if (results.chapters.length === 0 && results.episodes.length === 0) {
    return <p style={{ color: 'var(--color-text-muted)' }}>Nothing in the year matches that.</p>;
  }
  return (
    <div className="space-y-6">
      {results.chapters.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-muted)' }}>Chapters</h2>
          <div className="space-y-2">
            {results.chapters.map((chapter) => (
              <Link
                key={chapter.week}
                href={`/dashboard/v2/modules/willie-billy/weeks/${chapter.week}`}
                className="block rounded-xl px-4 py-3"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
              >
                <span className="font-semibold" style={{ color: 'var(--color-text-main)' }}>
                  Chapter {chapter.week}: {chapter.title}
                </span>
                <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}> · {chapter.place}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
      {results.episodes.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-muted)' }}>Episodes</h2>
          <div className="space-y-2">
            {results.episodes.map((ep) => (
              <Link
                key={`${ep.episode}-${ep.slot}`}
                href={`/dashboard/v2/modules/willie-billy/weeks/${ep.week}`}
                className="block rounded-xl px-4 py-3"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
              >
                <div className="font-semibold" style={{ color: 'var(--color-text-main)' }}>
                  Episode {ep.episode} · Day {ep.day} {ep.slot === 'morning' ? 'Morning' : 'Night'} · {ep.title}
                </div>
                <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  {ep.format} · {ep.chapterTitle} · {findStatus(ep.week)}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
