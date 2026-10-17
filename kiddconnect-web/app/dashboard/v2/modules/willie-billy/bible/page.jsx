'use client';

import WillieBillyPage from '@/components/willie-billy/WillieBillyNav';
import { CHARACTERS, CONTINUITY, FINDS, RULES, SEASONS } from '@/lib/willie-billy/series';

export default function WillieBillyBible() {
  return (
    <WillieBillyPage>
      <h1 className="text-3xl font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>Bible</h1>
      <p className="mb-6" style={{ color: 'var(--color-text-muted)', maxWidth: 680 }}>
        Willie and Billy are a dad and son in blue and white. The game is finding the pair. They are not a red-and-white seek-and-find character, and the pictures should never borrow that costume.
      </p>

      <Section title="People">
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
          {CHARACTERS.map((person) => (
            <article
              key={person.name}
              className="rounded-2xl p-4"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            >
              <h2 className="font-semibold" style={{ color: 'var(--color-text-main)' }}>{person.name}</h2>
              <p className="text-xs font-semibold mb-2" style={{ color: '#1d4ed8' }}>{person.role}</p>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{person.look}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section title="Rules of the bet">
        <ul className="space-y-2">
          {RULES.map((rule) => (
            <li key={rule} className="text-sm" style={{ color: 'var(--color-text-main)' }}>{rule}</li>
          ))}
        </ul>
      </Section>

      <Section title="The three finds">
        <ol className="space-y-3">
          {FINDS.map((find) => (
            <li key={find.n} className="text-sm" style={{ color: 'var(--color-text-main)' }}>
              <span className="font-semibold">Find {find.n}</span>
              <span style={{ color: 'var(--color-text-muted)' }}> · Week {find.week} · {find.text}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Seasons">
        <div className="space-y-3">
          {SEASONS.map((season) => (
            <div key={season.id}>
              <h2 className="font-semibold" style={{ color: 'var(--color-text-main)' }}>
                Season {season.id}: {season.name}
              </h2>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                Weeks {season.from}–{season.to}. {season.summary}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Continuity locks">
        <ul className="space-y-2">
          {CONTINUITY.map((item) => (
            <li key={item.label} className="text-sm" style={{ color: 'var(--color-text-main)' }}>
              <span className="font-semibold">{item.label}.</span>{' '}
              <span style={{ color: 'var(--color-text-muted)' }}>{item.detail}</span>
            </li>
          ))}
        </ul>
      </Section>
    </WillieBillyPage>
  );
}

function Section({ title, children }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text-main)' }}>{title}</h2>
      {children}
    </section>
  );
}
