'use client';

import { useEffect, useState } from 'react';
import WillieBillyPage from '@/components/willie-billy/WillieBillyNav';

const START_KEY = 'willie-billy-day-one';

function dayNumber(startIso) {
  if (!startIso) return null;
  const start = new Date(`${startIso}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - start) / 86400000) + 1;
  if (diff < 1) return { day: diff, label: `Day 1 is ${1 - diff} day${1 - diff === 1 ? '' : 's'} away.` };
  if (diff > 365) return { day: diff, label: 'The cartoon year is over. This is the real-world year.' };
  return { day: diff, label: `Today is Day ${diff}. Morning is episode ${diff * 2 - 1}. Night is episode ${diff * 2}.` };
}

export default function WillieBillyProduction() {
  const [start, setStart] = useState('');

  useEffect(() => {
    setStart(window.localStorage.getItem(START_KEY) || '');
  }, []);

  function save(value) {
    setStart(value);
    if (value) window.localStorage.setItem(START_KEY, value);
    else window.localStorage.removeItem(START_KEY);
  }

  const today = dayNumber(start);

  return (
    <WillieBillyPage>
      <h1 className="text-3xl font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>Production</h1>
      <p className="mb-6 text-sm" style={{ color: 'var(--color-text-muted)', maxWidth: 680 }}>
        Two shorts every day, then one chapter on the last day of the week. The morning short is the hide. The night short is what almost went wrong. The chapter is the only video that moves the plot, and it has to open on a scene the shorts never showed.
      </p>

      <section
        className="rounded-2xl p-4 mb-6"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <h2 className="font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>Day 1</h2>
        <p className="text-sm mb-3" style={{ color: 'var(--color-text-muted)' }}>
          Set the morning the series starts. This stays on this browser so the board can tell you which day you are on.
        </p>
        <input
          type="date"
          value={start}
          onChange={(e) => save(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm"
          style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-main)' }}
        />
        {today && (
          <p className="text-sm mt-3" style={{ color: 'var(--color-text-main)' }}>{today.label}</p>
        )}
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
