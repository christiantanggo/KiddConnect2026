'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import WillieBillyPage from '@/components/willie-billy/WillieBillyNav';
import {
  connectWillieYouTube,
  disconnectWillieYouTube,
  getWillieSchedule,
  getWillieYouTube,
  listWillieRenders,
  postWillieRender,
  produceWillieToday,
  saveWillieSchedule,
} from '@/lib/willie-billy/client';

const YOUTUBE_ERRORS = {
  youtube_oauth_denied: 'Google sign-in was cancelled.',
  youtube_oauth_failed: 'Google did not return an authorization code. Try again.',
  youtube_not_configured: 'YouTube OAuth is not configured on the server yet.',
  invalid_grant: 'Google rejected the authorization. Click Connect YouTube again.',
  no_channel_found: 'That Google account has no YouTube channel.',
  youtube_oauth_error: 'Something went wrong connecting YouTube. Try again.',
};

function dayLabel(schedule) {
  const day = schedule?.day_number;
  if (!schedule?.day_one || day == null) return 'Set the morning the series starts.';
  if (day < 1) return `Day 1 is ${1 - day} day${1 - day === 1 ? '' : 's'} away.`;
  if (day > 365) return 'The cartoon year is over. This is the real-world year.';
  return `Today is Day ${day}. Morning is episode ${day * 2 - 1}. Night is episode ${day * 2}.`;
}

export default function WillieBillyProduction() {
  return (
    <Suspense fallback={null}>
      <WillieBillyProductionInner />
    </Suspense>
  );
}

function WillieBillyProductionInner() {
  const [schedule, setSchedule] = useState(null);
  const [renders, setRenders] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [youtube, setYoutube] = useState(null);
  const [posting, setPosting] = useState(null);
  const searchParams = useSearchParams();

  async function refresh() {
    const [scheduleRes, renderRes, youtubeRes] = await Promise.all([
      getWillieSchedule(),
      listWillieRenders(),
      getWillieYouTube().catch(() => null),
    ]);
    setSchedule(scheduleRes.schedule);
    setRenders(renderRes.renders || []);
    if (youtubeRes) setYoutube(youtubeRes);
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (searchParams.get('youtube_connected') === 'true') {
      setError('');
    }
    const code = searchParams.get('error');
    if (!code) return;
    const channel = searchParams.get('channel');
    if (code === 'wrong_channel') {
      setError(`That Google account opened ${channel || 'a different channel'}. Connect @WheresWillieAndBilly.`);
      return;
    }
    setError(YOUTUBE_ERRORS[code] || `YouTube: ${code}`);
  }, [searchParams]);

  useEffect(() => {
    const pending = renders.some((row) => row.status === 'queued' || row.status === 'rendering');
    if (!pending) return undefined;
    const timer = setInterval(() => {
      refresh().catch(() => {});
    }, 8000);
    return () => clearInterval(timer);
  }, [renders]);

  async function save(patch) {
    setBusy(true);
    setError('');
    try {
      const res = await saveWillieSchedule(patch);
      setSchedule(res.schedule);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function makeToday() {
    setBusy(true);
    setError('');
    try {
      if (!schedule?.day_one) {
        const today = new Date();
        const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        await saveWillieSchedule({ day_one: iso, auto_produce: true, timezone: 'America/Toronto' });
      }
      await produceWillieToday();
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <WillieBillyPage>
      <h1 className="text-3xl font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>Production</h1>
      <p className="mb-6 text-sm" style={{ color: 'var(--color-text-muted)', maxWidth: 680 }}>
        Two shorts every day, then one chapter on the last day of the week. Each short is a new picture and a short narration. The chapter is a longer film once a week. Finished videos play here.
      </p>

      {error && (
        <p className="text-sm mb-4" style={{ color: '#b91c1c' }}>{error}</p>
      )}

      <section
        className="rounded-2xl p-4 mb-6"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <h2 className="font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>YouTube</h2>
        <p className="text-sm mb-3" style={{ color: 'var(--color-text-muted)' }}>
          Connect {youtube?.account || 'christian.fournierattanggo@gmail.com'} and choose {youtube?.expected_handle || '@WheresWillieAndBilly'}. Finished videos post as unlisted until you make them public on YouTube.
        </p>
        <p className="text-sm mb-3" style={{ color: 'var(--color-text-main)' }}>
          {youtube?.connected
            ? `Connected to ${youtube.channel_handle || youtube.channel_title || 'your channel'}.`
            : 'Not connected yet.'}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                const data = await connectWillieYouTube();
                window.location.href = data.url;
              } catch (err) {
                setError(err.message);
                setBusy(false);
              }
            }}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold"
            style={{ background: '#1d4ed8', color: '#fff' }}
          >
            {youtube?.connected ? 'Reconnect YouTube' : 'Connect YouTube'}
          </button>
          {youtube?.connected && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  setYoutube(await disconnectWillieYouTube());
                } catch (err) {
                  setError(err.message);
                } finally {
                  setBusy(false);
                }
              }}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold"
              style={{ background: 'var(--color-surface)', color: '#1d4ed8', border: '1px solid #bfdbfe' }}
            >
              Disconnect
            </button>
          )}
        </div>
      </section>

      <section
        className="rounded-2xl p-4 mb-6"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <h2 className="font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>Day 1</h2>
        <p className="text-sm mb-3" style={{ color: 'var(--color-text-muted)' }}>
          The daily run uses this date in Toronto time. It makes today’s morning and night, and the chapter when the week ends. A missed day stays missed until you open that chapter and make it.
        </p>
        <input
          type="date"
          value={schedule?.day_one || ''}
          onChange={(e) => save({ day_one: e.target.value || null })}
          className="px-3 py-2 rounded-lg text-sm"
          style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-main)' }}
        />
        <p className="text-sm mt-3" style={{ color: 'var(--color-text-main)' }}>{dayLabel(schedule)}</p>
        <div className="flex flex-wrap gap-2 mt-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => save({ auto_produce: !schedule?.auto_produce })}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold"
            style={{ background: schedule?.auto_produce ? '#dbeafe' : 'var(--color-surface)', color: '#1d4ed8', border: '1px solid #bfdbfe' }}
          >
            {schedule?.auto_produce ? 'Daily run is on' : 'Turn on the daily run'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={makeToday}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold"
            style={{ background: '#1d4ed8', color: '#fff' }}
          >
            Make today’s shorts
          </button>
        </div>
      </section>

      <section
        className="rounded-2xl p-4 mb-6"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <h2 className="font-semibold mb-3" style={{ color: 'var(--color-text-main)' }}>Recent videos</h2>
        {renders.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Nothing has been made yet.</p>
        )}
        <div className="space-y-4">
          {renders.slice(0, 8).map((row) => (
            <article key={row.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-main)' }}>
                  {row.kind === 'chapter' ? `Chapter ${row.week}` : `Episode ${row.episode_number}`} · {row.title}
                </h3>
                <span className="text-xs font-semibold" style={{ color: '#1d4ed8' }}>{row.status}</span>
              </div>
              {row.error && <p className="text-xs mt-1" style={{ color: '#b91c1c' }}>{row.error}</p>}
              {row.video_url && (
                <video
                  key={row.video_url}
                  src={row.video_url}
                  poster={row.image_url || undefined}
                  controls
                  playsInline
                  className="mt-2 w-full max-w-sm rounded-xl bg-black"
                />
              )}
              {row.youtube_url && (
                <a href={row.youtube_url} target="_blank" rel="noreferrer" className="text-xs font-semibold mt-2 inline-block" style={{ color: '#1d4ed8' }}>
                  Open on YouTube
                </a>
              )}
              {row.video_url && !row.youtube_url && (
                <button
                  type="button"
                  disabled={posting === row.id}
                  onClick={async () => {
                    setPosting(row.id);
                    setError('');
                    try {
                      await postWillieRender(row.id);
                      await refresh();
                    } catch (err) {
                      setError(err.message);
                    } finally {
                      setPosting(null);
                    }
                  }}
                  className="text-xs font-semibold mt-2"
                  style={{ color: '#1d4ed8' }}
                >
                  {posting === row.id ? 'Posting…' : 'Post to YouTube'}
                </button>
              )}
            </article>
          ))}
        </div>
      </section>

      <section
        className="rounded-2xl p-4 mb-6"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <h2 className="font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>Weekly edit</h2>
        <ul className="text-sm space-y-2" style={{ color: 'var(--color-text-main)' }}>
          <li>Monday morning is a wide still hunt. Monday night is a 20-second story.</li>
          <li>Tuesday morning moves. Tuesday night is impostors.</li>
          <li>Wednesday morning is a slow hunt. Wednesday night is spot the difference.</li>
          <li>Thursday morning is impostors. Thursday night moves.</li>
          <li>Friday morning is spot the difference. Friday night is a story.</li>
          <li>Saturday morning is the hard crowd. Saturday night is a tight clue.</li>
          <li>Sunday morning opens the chapter. Sunday night teases next week.</li>
        </ul>
        <p className="text-sm mt-3" style={{ color: 'var(--color-text-muted)' }}>
          Week 52 has an eighth day so Day 365 is the porch. Art style changes every week. Weeks 48–52 use real photographs.
        </p>
      </section>

      <section
        className="rounded-2xl p-4"
        style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}
      >
        <h2 className="font-semibold mb-2" style={{ color: '#1e3a8a' }}>Before Week 48</h2>
        <p className="text-sm" style={{ color: '#1e3a8a' }}>
          Pick the real town and shoot the porch, the store, the park, and the bus stop. Those plates are the last month of the cartoon and the first locations of the live year. The last frame of Day 365 is that porch, empty, with two blue threads on the rail.
        </p>
      </section>
    </WillieBillyPage>
  );
}
