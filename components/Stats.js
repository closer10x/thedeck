'use client';

import { useMemo } from 'react';
import { OUTCOME_EMOJI } from '../lib/format';

const C = {
  surface: '#FFFFFF',
  ink: '#16151C',
  muted: '#86848F',
  line: '#E9E8EF',
  accent: '#4B3BE0',
};

const BARS = [
  { id: 'yes', label: 'Yes', color: '#12805C' },
  { id: 'pending', label: 'Waiting', color: '#8C8A96' },
  { id: 'no', label: 'No', color: '#D6336C' },
  { id: 'ghost', label: 'Ghosted', color: '#A87400' },
];

// 12 weeks of asks, oldest first — enough to see a streak or a drought
function weeklyAsks(invites, weeks = 12) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7 * (weeks - 1));
  const buckets = Array.from({ length: weeks }, () => 0);
  for (const inv of invites) {
    const d = new Date(inv.invited_at);
    const idx = Math.floor((d - start) / (7 * 86400000));
    if (idx >= 0 && idx < weeks) buckets[idx] += 1;
  }
  return buckets;
}

export default function Stats({ rows, invites }) {
  const s = useMemo(() => {
    const counts = { yes: 0, pending: 0, no: 0, ghost: 0 };
    for (const i of invites) if (counts[i.outcome] !== undefined) counts[i.outcome] += 1;

    const asked = invites.length;
    const answered = counts.yes + counts.no + counts.ghost;
    const hitRate = answered ? Math.round((counts.yes / answered) * 100) : null;

    const cold = rows.filter((r) => r.days === null || r.days > 21).length;
    const gaps = rows.filter((r) => r.days !== null).map((r) => r.days);
    const median = gaps.length
      ? [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]
      : null;

    const best = [...rows]
      .filter((r) => r.count > 0)
      .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1))[0];

    return { counts, asked, answered, hitRate, cold, median, best, weeks: weeklyAsks(invites) };
  }, [rows, invites]);

  const peak = Math.max(1, ...s.weeks);
  const total = Math.max(1, s.asked);

  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${C.line}`,
        borderRadius: 16,
        padding: 14,
        marginBottom: 12,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <Tile label="On deck" value={rows.length} />
        <Tile label="Asks" value={s.asked} />
        <Tile
          label="Hit rate"
          value={s.hitRate === null ? '—' : `${s.hitRate}%`}
          tint={s.hitRate !== null && s.hitRate >= 50 ? '#12805C' : undefined}
        />
        <Tile label="Gone cold" value={s.cold} tint={s.cold ? '#D6336C' : undefined} />
        <Tile label="Typical gap" value={s.median === null ? '—' : `${s.median}d`} />
        <Tile label="Waiting" value={s.counts.pending} />
      </div>

      {/* how the asks landed */}
      {s.asked > 0 && (
        <>
          <div style={{ display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden', marginTop: 14 }}>
            {BARS.map((b) =>
              s.counts[b.id] ? (
                <span
                  key={b.id}
                  title={`${b.label}: ${s.counts[b.id]}`}
                  style={{
                    width: `${(s.counts[b.id] / total) * 100}%`,
                    background: b.color,
                    transition: 'width 300ms ease',
                  }}
                />
              ) : null
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 9 }}>
            {BARS.filter((b) => s.counts[b.id]).map((b) => (
              <span
                key={b.id}
                style={{
                  fontFamily: 'var(--mono), monospace',
                  fontSize: 10.5,
                  color: C.muted,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span style={{ fontSize: 11 }}>{OUTCOME_EMOJI[b.id]}</span>
                {s.counts[b.id]} {b.label.toLowerCase()}
              </span>
            ))}
          </div>
        </>
      )}

      {/* asks per week */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 42, marginTop: 16 }}>
        {s.weeks.map((n, i) => (
          <span
            key={i}
            title={`${n} ${n === 1 ? 'ask' : 'asks'}`}
            style={{
              flex: 1,
              height: `${Math.max(6, (n / peak) * 100)}%`,
              borderRadius: 3,
              background: n ? C.accent : '#EFEEF4',
              opacity: n ? 0.35 + 0.65 * (n / peak) : 1,
            }}
          />
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: 'var(--mono), monospace',
          fontSize: 9.5,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: C.muted,
          marginTop: 5,
        }}
      >
        <span>12 weeks ago</span>
        <span>this week</span>
      </div>

      {s.best && (
        <div style={{ fontSize: 12, color: C.muted, marginTop: 12 }}>
          Best odds: <strong style={{ color: C.ink, fontWeight: 600 }}>{s.best.name}</strong> at{' '}
          {s.best.rate}% over {s.best.count} {s.best.count === 1 ? 'ask' : 'asks'}.
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, tint }) {
  return (
    <div
      style={{
        background: '#FAF9FC',
        border: `1px solid ${C.line}`,
        borderRadius: 11,
        padding: '9px 10px',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--mono), monospace',
          fontSize: 19,
          fontWeight: 600,
          lineHeight: 1,
          color: tint || C.ink,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 9.5,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: C.muted,
          marginTop: 5,
        }}
      >
        {label}
      </div>
    </div>
  );
}
