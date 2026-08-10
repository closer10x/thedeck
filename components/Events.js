'use client';

import { useMemo } from 'react';
import { CalendarDays, MapPin } from 'lucide-react';
import Avatar from './Avatar';
import { STATUSES } from './EventSheet';

const C = {
  surface: '#FFFFFF',
  ink: '#16151C',
  muted: '#86848F',
  line: '#E9E8EF',
  accent: '#4B3BE0',
};

const BY_ID = Object.fromEntries(STATUSES.map((s) => [s.id, s]));

// "Sat 14 Mar", and the year only once it isn't this one
function when(iso) {
  if (!iso) return 'Someday';
  const d = new Date(iso);
  const opts = { weekday: 'short', month: 'short', day: 'numeric' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString(undefined, opts);
}

// How far off it is, or how long ago. The number is what you actually scan for.
function countdown(iso) {
  if (!iso) return null;
  const midnight = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((midnight(new Date(iso)) - midnight(new Date())) / 86400000);
  if (days === 0) return 'Tonight';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return days > 0 ? `in ${days}d` : `${-days}d ago`;
}

export default function Events({ events, guests, people, state, onOpen }) {
  const { upcoming, past } = useMemo(() => {
    const byEvent = {};
    for (const g of guests) (byEvent[g.event_id] ||= []).push(g);

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const rows = events.map((e) => ({
      ...e,
      guests: (byEvent[e.id] || []).map((g) => ({
        ...g,
        person: people.find((p) => p.id === g.person_id),
      })),
    }));

    // No date means it hasn't happened yet — it's a plan, not a memory.
    const isPast = (e) => e.at && new Date(e.at) < startOfToday;
    return {
      // soonest first for what's ahead, most recent first for what's behind
      upcoming: rows
        .filter((e) => !isPast(e))
        .sort((a, b) => (a.at ? new Date(a.at) : Infinity) - (b.at ? new Date(b.at) : Infinity)),
      past: rows.filter(isPast).sort((a, b) => new Date(b.at) - new Date(a.at)),
    };
  }, [events, guests, people]);

  if (state === 'loading') return <Empty text="Loading events…" />;
  if (state === 'missing') {
    return (
      <Empty>
        Events aren&apos;t set up yet. Paste{' '}
        <code style={{ fontFamily: 'var(--mono), monospace', fontSize: 12 }}>supabase/events.sql</code>{' '}
        into the Supabase SQL editor and this tab comes alive.
      </Empty>
    );
  }
  if (state === 'error') return <Empty text="Couldn't load events." />;
  if (!events.length) {
    return (
      <Empty text="No events yet. When someone says yes, make one and put her on it." />
    );
  }

  return (
    <>
      {upcoming.length > 0 && (
        <Section title="Coming up">
          {upcoming.map((e) => (
            <Card key={e.id} event={e} onOpen={() => onOpen(e.id)} />
          ))}
        </Section>
      )}
      {past.length > 0 && (
        <Section title="Been and gone">
          {past.map((e) => (
            <Card key={e.id} event={e} past onOpen={() => onOpen(e.id)} />
          ))}
        </Section>
      )}
    </>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div
        style={{
          fontFamily: 'var(--mono), monospace',
          fontSize: 10.5,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: C.muted,
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function Card({ event, past, onOpen }) {
  const soon = countdown(event.at);
  // the tally reads "3 coming · 1 maybe" — only the statuses actually in use
  const tally = STATUSES.map((s) => ({
    ...s,
    n: event.guests.filter((g) => g.status === s.id).length,
  })).filter((s) => s.n > 0);

  return (
    <button
      onClick={onOpen}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: C.surface,
        border: `1px solid ${C.line}`,
        borderRadius: 16,
        padding: 14,
        marginBottom: 9,
        opacity: past ? 0.82 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <span
          style={{
            fontFamily: 'var(--display), sans-serif',
            fontSize: 17,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            color: C.ink,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {event.name}
        </span>
        {soon && (
          <span
            style={{
              flexShrink: 0,
              fontFamily: 'var(--mono), monospace',
              fontSize: 10.5,
              fontWeight: 600,
              color: past ? C.muted : C.accent,
              background: past ? '#F1F0F5' : '#EEECFD',
              borderRadius: 8,
              padding: '3px 7px',
            }}
          >
            {soon}
          </span>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginTop: 6,
          fontFamily: 'var(--mono), monospace',
          fontSize: 11,
          color: C.muted,
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <CalendarDays size={12} /> {when(event.at)}
        </span>
        {event.place && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            <MapPin size={12} /> {event.place}
          </span>
        )}
      </div>

      {event.guests.length > 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 11 }}>
          {/* faces overlap so a long list stays one line */}
          <div style={{ display: 'flex' }}>
            {event.guests.slice(0, 5).map((g, i) => (
              <span key={g.id} style={{ marginLeft: i ? -9 : 0, borderRadius: '50%', border: '2px solid #fff', display: 'flex' }}>
                <Avatar name={g.person?.name || '?'} url={g.person?.photo_url} size={27} />
              </span>
            ))}
            {event.guests.length > 5 && (
              <span
                style={{
                  marginLeft: -9,
                  width: 27,
                  height: 27,
                  borderRadius: '50%',
                  border: '2px solid #fff',
                  background: '#EEECFD',
                  color: C.accent,
                  fontSize: 10.5,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                +{event.guests.length - 5}
              </span>
            )}
          </div>
          <span style={{ fontFamily: 'var(--mono), monospace', fontSize: 10.5, color: C.muted }}>
            {tally.map((s) => `${s.n} ${s.label.toLowerCase()}`).join(' · ')}
          </span>
        </div>
      ) : (
        <div style={{ fontFamily: 'var(--mono), monospace', fontSize: 10.5, color: C.muted, marginTop: 11 }}>
          Nobody on it yet
        </div>
      )}
    </button>
  );
}

function Empty({ text, children }) {
  return (
    <div
      style={{
        background: '#fff',
        border: `1px solid ${C.line}`,
        borderRadius: 16,
        padding: '38px 22px',
        textAlign: 'center',
        color: C.muted,
        fontSize: 14,
        lineHeight: 1.55,
      }}
    >
      {children || text}
    </div>
  );
}
