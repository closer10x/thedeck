'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, Plus, ChevronDown, LayoutGrid, Rows3 } from 'lucide-react';
import Avatar from './Avatar';
import PersonSheet from './PersonSheet';
import Stats from './Stats';
import Mark from './Mark';
import { daysSince, temp, rate, initials, OUTCOME_EMOJI } from '../lib/format';

const SORTS = [
  { id: 'cold', label: 'Coldest' },
  { id: 'recent', label: 'Just asked' },
  { id: 'most', label: 'Most asked' },
  { id: 'rate', label: 'Best rate' },
  { id: 'az', label: 'A–Z' },
];

const C = {
  canvas: '#F5F4F8',
  surface: '#FFFFFF',
  ink: '#16151C',
  muted: '#86848F',
  line: '#E9E8EF',
  accent: '#4B3BE0',
};

export default function Roster(props) {
  const { people, invites, loading, error } = props;
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('cold');
  // tucked away by default — the list is the point, the numbers are a peek
  const [showStats, setShowStats] = useState(false);
  // hold the id, not the row object — rows are rebuilt on every reload, so a
  // captured object goes stale the moment you log an ask from inside the sheet
  const [openId, setOpenId] = useState(null); // person id or 'new'

  // Grid is faces, list is facts — which one you want depends on whether you're
  // browsing or working the queue, so it's a toggle rather than a decision.
  // Read from storage after mount, never during: this page is prerendered, and
  // seeding state from localStorage would hydrate against different markup.
  const [view, setView] = useState('grid'); // 'grid' | 'list'
  useEffect(() => {
    const saved = localStorage.getItem('rolodeck_view');
    if (saved === 'grid' || saved === 'list') setView(saved);
  }, []);

  function chooseView(v) {
    setView(v);
    localStorage.setItem('rolodeck_view', v);
  }

  const rows = useMemo(() => {
    const byPerson = {};
    for (const inv of invites) (byPerson[inv.person_id] ||= []).push(inv);

    let list = people
      .filter((p) => !p.archived)
      .map((p) => {
        const mine = (byPerson[p.id] || []).sort(
          (a, b) => new Date(b.invited_at) - new Date(a.invited_at)
        );
        const last = mine[0]?.invited_at || null;
        return {
          ...p,
          invites: mine,
          count: mine.length,
          last,
          days: daysSince(last),
          rate: rate(mine),
        };
      });

    if (q.trim()) {
      const needle = q.toLowerCase();
      list = list.filter((p) =>
        [p.name, p.ig_handle, p.note].filter(Boolean).join(' ').toLowerCase().includes(needle)
      );
    }

    const big = 99999;
    const sorters = {
      cold: (a, b) => (b.days ?? big) - (a.days ?? big),
      recent: (a, b) => (a.days ?? big) - (b.days ?? big),
      most: (a, b) => b.count - a.count,
      rate: (a, b) => (b.rate ?? -1) - (a.rate ?? -1),
      az: (a, b) => a.name.localeCompare(b.name),
    };
    return list.sort(sorters[sort]);
  }, [people, invites, q, sort]);

  const owed = rows.filter((r) => r.days === null || r.days > 21).length;
  // re-read her off the fresh rows every render so the invite list stays live
  const openPerson = openId && openId !== 'new' ? rows.find((r) => r.id === openId) : null;

  return (
    <main
      style={{
        maxWidth: 480,
        margin: '0 auto',
        minHeight: '100dvh',
        background: C.canvas,
        paddingBottom: 104,
      }}
    >
      {/* header */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 5,
          background: C.surface,
          borderBottom: `1px solid ${C.line}`,
          padding: '18px 16px 12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'flex', color: C.accent, flexShrink: 0 }}>
              <Mark size={25} strokeWidth={1.5} />
            </span>
            <h1
              style={{
                margin: 0,
                fontFamily: 'var(--display), sans-serif',
                fontSize: 25,
                letterSpacing: '-0.035em',
                fontWeight: 700,
              }}
            >
              The Deck
            </h1>
          </div>
          <button
            onClick={() => setShowStats((v) => !v)}
            title={showStats ? 'Hide stats' : 'Show stats'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              border: 'none',
              background: 'transparent',
              padding: 0,
              fontFamily: 'var(--mono), monospace',
              fontSize: 10.5,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: showStats ? C.accent : owed ? '#D6336C' : C.muted,
            }}
          >
            {rows.length} on deck · {owed} owed
            <ChevronDown
              size={13}
              style={{
                transform: showStats ? 'rotate(180deg)' : 'none',
                transition: 'transform 180ms ease',
              }}
            />
          </button>
        </div>

        <div style={{ position: 'relative', marginTop: 12 }}>
          <Search
            size={15}
            color={C.muted}
            style={{ position: 'absolute', left: 12, top: 12, pointerEvents: 'none' }}
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, handle, note"
            style={{
              width: '100%',
              padding: '10px 12px 10px 34px',
              borderRadius: 11,
              border: `1px solid ${C.line}`,
              background: C.canvas,
              fontSize: 14.5,
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
          {/* the chips scroll; the view toggle stays put. minWidth:0 so the
              scroller is allowed to shrink instead of shoving the toggle off */}
          <div
            style={{
              display: 'flex',
              gap: 6,
              flex: 1,
              minWidth: 0,
              overflowX: 'auto',
              scrollbarWidth: 'none',
            }}
          >
            {SORTS.map((s) => {
              const on = s.id === sort;
              return (
                <button
                  key={s.id}
                  onClick={() => setSort(s.id)}
                  style={{
                    flexShrink: 0,
                    padding: '6px 11px',
                    borderRadius: 999,
                    border: `1px solid ${on ? C.accent : C.line}`,
                    background: on ? C.accent : C.surface,
                    color: on ? '#fff' : C.muted,
                    fontSize: 12.5,
                    fontWeight: 500,
                  }}
                >
                  {s.label}
                </button>
              );
            })}
          </div>

          <div
            style={{
              display: 'flex',
              flexShrink: 0,
              gap: 2,
              padding: 2,
              borderRadius: 999,
              border: `1px solid ${C.line}`,
              background: C.canvas,
            }}
          >
            {[
              { id: 'grid', Icon: LayoutGrid, label: 'Grid view' },
              { id: 'list', Icon: Rows3, label: 'List view' },
            ].map(({ id, Icon, label }) => {
              const on = view === id;
              return (
                <button
                  key={id}
                  onClick={() => chooseView(id)}
                  aria-label={label}
                  aria-pressed={on}
                  title={label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '5px 8px',
                    borderRadius: 999,
                    border: 'none',
                    background: on ? C.surface : 'transparent',
                    color: on ? C.accent : C.muted,
                    boxShadow: on ? '0 1px 3px rgba(22,21,28,0.12)' : 'none',
                  }}
                >
                  <Icon size={15} />
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* list */}
      <div style={{ padding: 12 }}>
        {showStats && !loading && !error && <Stats rows={rows} invites={invites} />}
        {loading && <Empty text="Loading the deck…" />}
        {error && <Empty text={`Couldn't load: ${error}`} />}
        {!loading && !error && rows.length === 0 && (
          <Empty text={q ? 'No one matches that.' : 'Nobody on deck yet. Add someone below.'} />
        )}

        {rows.length > 0 &&
          (view === 'grid' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {rows.map((p) => (
                <Card key={p.id} p={p} onOpen={() => setOpenId(p.id)} />
              ))}
            </div>
          ) : (
            <div
              style={{
                background: C.surface,
                borderRadius: 16,
                border: `1px solid ${C.line}`,
                overflow: 'hidden',
              }}
            >
              {rows.map((p, i) => (
                <Row key={p.id} p={p} first={i === 0} onOpen={() => setOpenId(p.id)} />
              ))}
            </div>
          ))}
      </div>

      {/* add */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '12px 16px calc(16px + env(safe-area-inset-bottom))',
          background: 'linear-gradient(to top, #F5F4F8 62%, rgba(245,244,248,0))',
          maxWidth: 480,
          margin: '0 auto',
        }}
      >
        <button
          onClick={() => setOpenId('new')}
          style={{
            width: '100%',
            padding: '14px 16px',
            borderRadius: 14,
            border: 'none',
            background: C.accent,
            color: '#fff',
            fontSize: 15,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            boxShadow: '0 6px 20px rgba(75,59,224,0.28)',
          }}
        >
          <Plus size={17} /> Add someone
        </button>
      </div>

      {(openId === 'new' || openPerson) && (
        <PersonSheet
          key={openId}
          person={openPerson}
          onClose={() => setOpenId(null)}
          onSave={props.onSavePerson}
          onRemove={props.onRemovePerson}
          onLogInvite={props.onLogInvite}
          onSetOutcome={props.onSetOutcome}
          onSetInviteNote={props.onSetInviteNote}
          onDeleteInvite={props.onDeleteInvite}
        />
      )}
    </main>
  );
}

// the day badge says how long it's been; this says when it actually was.
// year only once it isn't this one, so the common case stays short.
function lastAsked(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const opts = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString(undefined, opts);
}

// Two to a row: her face and her name, nothing else. The day badge rides the
// corner of the photo so the card stays a photo rather than a data row.
function Card({ p, onOpen }) {
  const t = temp(p.days);
  return (
    <button
      onClick={onOpen}
      style={{
        display: 'block',
        width: '100%',
        // grid items default to min-width:auto, so a long nowrap name sets the
        // column's minimum and the two columns stop being equal
        minWidth: 0,
        padding: 10,
        background: C.surface,
        border: `1px solid ${C.line}`,
        borderRadius: 16,
        textAlign: 'center',
      }}
    >
      <div style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1' }}>
        {p.photo_url ? (
          <img
            src={p.photo_url}
            alt=""
            loading="lazy"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              borderRadius: 12,
              background: '#EEECFD',
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: 12,
              background: '#EEECFD',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--display), sans-serif',
              fontSize: 30,
              fontWeight: 600,
              color: C.accent,
            }}
          >
            {initials(p.name) || '?'}
          </div>
        )}

        <span
          title={p.days === null ? 'Never asked' : `${p.days} days since the last ask`}
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            padding: '3px 7px',
            borderRadius: 8,
            background: t.bg,
            color: t.color,
            fontFamily: 'var(--mono), monospace',
            fontSize: 10.5,
            fontWeight: 600,
            lineHeight: 1.3,
            boxShadow: '0 1px 3px rgba(22,21,28,0.12)',
          }}
        >
          {p.days === null ? 'new' : `${p.days}d`}
        </span>

        {p.rat_chat && (
          <span
            title="In the rat chat"
            style={{
              position: 'absolute',
              top: 6,
              left: 6,
              fontSize: 10,
              background: 'rgba(255,255,255,0.92)',
              borderRadius: 7,
              padding: '2px 5px',
              lineHeight: 1.2,
              boxShadow: '0 1px 3px rgba(22,21,28,0.12)',
            }}
          >
            {'🐀'}
          </span>
        )}
      </div>

      <div
        style={{
          marginTop: 9,
          fontFamily: 'var(--display), sans-serif',
          fontSize: 15,
          fontWeight: 600,
          letterSpacing: '-0.015em',
          color: C.ink,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {p.name}
      </div>
    </button>
  );
}

function Row({ p, first, onOpen }) {
  const t = temp(p.days);
  return (
    <button
      onClick={onOpen}
      style={{
        display: 'flex',
        gap: 13,
        alignItems: 'center',
        width: '100%',
        padding: '16px 14px',
        background: 'transparent',
        border: 'none',
        borderTop: first ? 'none' : '1px solid #EFEEF4',
        textAlign: 'left',
      }}
    >
      <Avatar name={p.name} url={p.photo_url} size={50} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span
            style={{
              fontFamily: 'var(--display), sans-serif',
              fontSize: 17,
              fontWeight: 600,
              letterSpacing: '-0.015em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {p.name}
          </span>
          {p.rat_chat && (
            <span
              title="In the rat chat"
              style={{
                fontSize: 9.5,
                background: '#F1F0F5',
                borderRadius: 5,
                padding: '2px 5px',
                flexShrink: 0,
                lineHeight: 1.2,
              }}
            >
              {'\uD83D\uDC00'}
            </span>
          )}
        </div>

        {/* the note stays in her sheet — the row is for the ask history */}

        {/* form strip and the tally get a line each — together they wrapped */}
        <div style={{ marginTop: 6 }}>
          <FormLine invites={p.invites} />
        </div>
        <div
          style={{
            fontFamily: 'var(--mono), monospace',
            fontSize: 11,
            color: '#8C8A96',
            marginTop: 4,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {p.count
            ? `${p.count} ${p.count === 1 ? 'ask' : 'asks'} · ${p.rate}% yes · last ${lastAsked(p.last)}`
            : 'Never asked'}
        </div>
      </div>

      <div
        style={{
          flexShrink: 0,
          textAlign: 'center',
          minWidth: 54,
          padding: '7px 6px',
          borderRadius: 10,
          background: t.bg,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--mono), monospace',
            fontSize: p.days === null ? 12 : 17,
            fontWeight: 600,
            lineHeight: 1,
            color: t.color,
          }}
        >
          {p.days === null ? '—' : p.days}
        </div>
        <div
          style={{
            fontSize: 9.5,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: t.color,
            opacity: 0.8,
            marginTop: 4,
          }}
        >
          {p.days === null ? 'new' : 'days'}
        </div>
      </div>
    </button>
  );
}

// last five asks, newest on the right
function FormLine({ invites }) {
  const last = invites.slice(0, 5).reverse();
  if (!last.length) return null;
  return (
    <span style={{ fontSize: 10.5, letterSpacing: 1.5, lineHeight: 1 }}>
      {last.map((i) => OUTCOME_EMOJI[i.outcome] || OUTCOME_EMOJI.pending).join('')}
    </span>
  );
}

function Empty({ text }) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #E9E8EF',
        borderRadius: 16,
        padding: '38px 20px',
        textAlign: 'center',
        color: '#86848F',
        fontSize: 14,
      }}
    >
      {text}
    </div>
  );
}
