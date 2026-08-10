'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Plus,
  ChevronDown,
  LayoutGrid,
  Rows3,
  History,
  LogOut,
  Sun,
  Moon,
  SunMoon,
  X,
} from 'lucide-react';
import Avatar from './Avatar';
import PersonSheet from './PersonSheet';
import Events from './Events';
import EventSheet from './EventSheet';
import ActivityLog from './ActivityLog';
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
  canvas: 'var(--canvas)',
  surface: 'var(--surface)',
  ink: 'var(--ink)',
  muted: 'var(--muted)',
  line: 'var(--line)',
  accent: 'var(--accent)',
};

export default function Roster(props) {
  const { people, invites, loading, error, me } = props;
  const { events = [], guests = [], eventsState = 'loading' } = props;
  const router = useRouter();
  const [q, setQ] = useState('');
  // who's signed in, and the log of what everyone's done
  const [menuOpen, setMenuOpen] = useState(false);
  const [showLog, setShowLog] = useState(false);
  // the deck is who you could ask; events are what came of it
  const [tab, setTab] = useState('deck'); // 'deck' | 'events'
  const [openEventId, setOpenEventId] = useState(null); // event id or 'new'
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef(null);

  // Opening it should put the cursor in it — otherwise revealing the field is
  // two taps to do one thing.
  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  // Closing clears the query with it. Leaving a hidden filter behind would mean
  // a roster missing people with nothing on screen explaining why.
  function closeSearch() {
    setQ('');
    setSearchOpen(false);
  }
  // Just asked, not coldest. The list opens on what you've actually been doing
  // rather than on a pile of reproach.
  const [sort, setSort] = useState('recent');
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

  // Light, dark, or whatever the phone is doing. Read after mount for the same
  // reason as the view toggle — this page is prerendered, and seeding state
  // from storage during render would hydrate against different markup. The
  // *paint* is handled earlier than this, by the inline script in layout.js.
  const [theme, setTheme] = useState('system');
  useEffect(() => {
    const saved = localStorage.getItem('rolodeck_theme');
    if (saved === 'dark' || saved === 'light') setTheme(saved);
  }, []);

  function chooseTheme(next) {
    setTheme(next);
    if (next === 'system') {
      localStorage.removeItem('rolodeck_theme');
      delete document.documentElement.dataset.theme;
    } else {
      localStorage.setItem('rolodeck_theme', next);
      document.documentElement.dataset.theme = next;
    }
  }

  // Handing the phone to the other one of you: drop the cookie and go back to
  // the pad, so his PIN starts his own session rather than writing under yours.
  async function signOut() {
    setMenuOpen(false);
    try {
      await fetch('/api/lock', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'manual' }),
      });
    } catch {
      /* going to the lock screen regardless */
    }
    router.replace('/lock');
    router.refresh();
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

  // Everyone, with her asks attached and nothing filtered out. `rows` is
  // narrowed by the deck's search box and drops archived people — fine for the
  // list you're looking at, wrong for events: a guest would lose her face the
  // moment you'd typed something into a search box on the other tab.
  const everyone = useMemo(() => {
    const byPerson = {};
    for (const inv of invites) (byPerson[inv.person_id] ||= []).push(inv);
    return people.map((p) => ({
      ...p,
      invites: (byPerson[p.id] || []).sort(
        (a, b) => new Date(b.invited_at) - new Date(a.invited_at)
      ),
    }));
  }, [people, invites]);

  const owed = rows.filter((r) => r.days === null || r.days > 21).length;
  // re-read her off the fresh rows every render so the invite list stays live
  const openPerson = openId && openId !== 'new' ? rows.find((r) => r.id === openId) : null;
  const openEvent =
    openEventId && openEventId !== 'new' ? events.find((e) => e.id === openEventId) : null;

  // Creating an event and filling it are one motion. The sheet can't show a
  // guest list until the event has an id, so the moment the insert returns one
  // we point the sheet at it — the same sheet, now with people in it.
  async function saveEventThenOpen(event) {
    const res = await props.onSaveEvent(event);
    if (!res?.error && res?.id && openEventId === 'new') setOpenEventId(res.id);
    return res;
  }

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
        className="glass"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 5,
          borderBottom: '1px solid var(--glass-fill)',
          padding: '18px 16px 12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {/* the way back to the field, and only on the tab it filters */}
            {tab === 'deck' && (
              <button
                onClick={() => (searchOpen || q ? closeSearch() : setSearchOpen(true))}
                aria-label={searchOpen || q ? 'Close search' : 'Search the deck'}
                aria-pressed={searchOpen || !!q}
                title="Search"
                style={{
                  display: 'flex',
                  border: 'none',
                  background: 'transparent',
                  padding: 2,
                  color: searchOpen || q ? C.accent : C.muted,
                }}
              >
                <Search size={16} />
              </button>
            )}
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
                color: showStats ? C.accent : owed ? 'var(--bad)' : C.muted,
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

            {/* Whose session this is. Initials rather than a name: the header
                is tight, and you already know who you are — it's there so the
                other one of you notices when it isn't him. */}
            {me && (
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  title={`Signed in as ${me.name}`}
                  aria-label={`Signed in as ${me.name}`}
                  aria-expanded={menuOpen}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    border: `1px solid ${menuOpen ? C.accent : C.line}`,
                    background: menuOpen ? C.accent : 'var(--accent-tint)',
                    color: menuOpen ? 'var(--surface)' : C.accent,
                    fontFamily: 'var(--display), sans-serif',
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: '0.01em',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'background 150ms ease, color 150ms ease',
                  }}
                >
                  {initials(me.name) || '?'}
                </button>

                {menuOpen && (
                  <>
                    {/* tap anywhere else to put it away */}
                    <div
                      onClick={() => setMenuOpen(false)}
                      style={{ position: 'fixed', inset: 0, zIndex: 8 }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        top: 40,
                        right: 0,
                        zIndex: 9,
                        minWidth: 190,
                        background: C.surface,
                        border: `1px solid ${C.line}`,
                        borderRadius: 14,
                        boxShadow: '0 12px 34px var(--shadow-lift)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          padding: '10px 13px',
                          borderBottom: `1px solid ${C.line}`,
                          fontSize: 12.5,
                          color: C.muted,
                        }}
                      >
                        Signed in as{' '}
                        <span style={{ color: C.ink, fontWeight: 600 }}>{me.name}</span>
                      </div>
                      <MenuItem
                        Icon={History}
                        label="Activity"
                        onClick={() => {
                          setMenuOpen(false);
                          setShowLog(true);
                        }}
                      />

                      {/* three states, not a switch: "follow the phone" is a
                          real answer and the one most people want */}
                      <div style={{ padding: '8px 10px 10px', borderTop: `1px solid ${C.line}` }}>
                        <div
                          style={{
                            fontFamily: 'var(--mono), monospace',
                            fontSize: 9.5,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            color: 'var(--label)',
                            margin: '2px 3px 7px',
                          }}
                        >
                          Appearance
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            gap: 2,
                            padding: 3,
                            borderRadius: 999,
                            background: 'var(--segment)',
                          }}
                        >
                          {[
                            { id: 'light', Icon: Sun, label: 'Light' },
                            { id: 'dark', Icon: Moon, label: 'Night' },
                            { id: 'system', Icon: SunMoon, label: 'Auto' },
                          ].map(({ id, Icon, label }) => {
                            const on = theme === id;
                            return (
                              <button
                                key={id}
                                onClick={() => chooseTheme(id)}
                                aria-pressed={on}
                                title={label}
                                style={{
                                  flex: 1,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 4,
                                  padding: '6px 0',
                                  borderRadius: 999,
                                  border: 'none',
                                  background: on ? C.surface : 'transparent',
                                  color: on ? C.ink : C.muted,
                                  fontSize: 11,
                                  fontWeight: on ? 650 : 500,
                                  boxShadow: on ? '0 1px 3px var(--shadow)' : 'none',
                                }}
                              >
                                <Icon size={12} />
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <MenuItem Icon={LogOut} label="Sign out" danger onClick={signOut} />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Two halves of the same thing: who you could ask, and what came of
            it. The pill sits directly under the title so switching is the
            first move available, not something buried in a menu. */}
        <div
          style={{
            display: 'flex',
            gap: 3,
            marginTop: 12,
            padding: 3,
            borderRadius: 999,
            background: 'var(--segment)',
          }}
        >
          {[
            { id: 'deck', label: 'Deck', count: rows.length },
            { id: 'events', label: 'Events', count: events.length },
          ].map((t) => {
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-pressed={on}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  borderRadius: 999,
                  border: 'none',
                  background: on ? C.surface : 'transparent',
                  color: on ? C.ink : C.muted,
                  fontSize: 13.5,
                  fontWeight: on ? 650 : 500,
                  boxShadow: on ? '0 1px 3px var(--shadow-lift)' : 'none',
                  transition: 'background 160ms ease, color 160ms ease',
                }}
              >
                {t.label}
                {t.count > 0 && (
                  <span
                    style={{
                      marginLeft: 6,
                      fontFamily: 'var(--mono), monospace',
                      fontSize: 10.5,
                      color: on ? C.accent : C.muted,
                    }}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* searching and sorting are about the deck; the events list has its
            own shape and neither applies to it */}
        {tab === 'deck' && (
          <>
        {/* Tucked away until asked for. With a deck this size you scroll to
            find someone far more often than you type — the field was taking a
            permanent row to solve an occasional problem. It stays open while
            there's a query in it, so a filtered list always shows its cause. */}
        {(searchOpen || q) && (
          <div style={{ position: 'relative', marginTop: 12 }}>
            <Search
              size={15}
              color={C.muted}
              style={{ position: 'absolute', left: 12, top: 12, pointerEvents: 'none' }}
            />
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && closeSearch()}
              placeholder="Search name, handle, note"
              style={{
                width: '100%',
                padding: '10px 34px 10px 34px',
                borderRadius: 11,
                border: `1px solid ${C.line}`,
                background: C.canvas,
                fontSize: 14.5,
              }}
            />
            <button
              onClick={closeSearch}
              aria-label="Close search"
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                border: 'none',
                background: 'transparent',
                color: C.muted,
                padding: 4,
                display: 'flex',
              }}
            >
              <X size={15} />
            </button>
          </div>
        )}

        {/* The toggle floats over the chips rather than taking a slot in the
            row, so the sorts keep the full width and slide underneath it. */}
        <div style={{ position: 'relative', marginTop: 10 }}>
          <div
            style={{
              display: 'flex',
              gap: 6,
              overflowX: 'auto',
              scrollbarWidth: 'none',
              // room to scroll the last chip out from under the toggle
              paddingRight: 84,
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
                    color: on ? 'var(--surface)' : C.muted,
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
              position: 'absolute',
              right: 0,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 2,
              display: 'flex',
              gap: 3,
              padding: 3,
              borderRadius: 999,
              // real glass: chips pass underneath and stay visible through it,
              // just blurred and lifted — no scrim wiping them out first
              border: '1px solid var(--glass-edge)',
              background: 'var(--glass-fill)',
              backdropFilter: 'blur(16px) saturate(180%)',
              WebkitBackdropFilter: 'blur(16px) saturate(180%)',
              boxShadow:
                '0 8px 22px var(--shadow-lift), 0 1px 2px var(--line), inset 0 1px 0 var(--glass-lit)',
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
                    padding: '6px 9px',
                    borderRadius: 999,
                    border: 'none',
                    background: on ? C.accent : 'transparent',
                    color: on ? 'var(--surface)' : C.muted,
                    boxShadow: on ? '0 2px 8px var(--accent-glow)' : 'none',
                    transition: 'background 170ms ease, color 170ms ease, box-shadow 170ms ease',
                  }}
                >
                  <Icon size={15} />
                </button>
              );
            })}
          </div>
        </div>
          </>
        )}
      </header>

      {/* list */}
      <div style={{ padding: 12 }}>
        {/* Running on the old single-PIN setting: everyone who gets in is
            "Owner", so the log can't tell you apart. Say so where it'll be
            seen, rather than letting the names quietly come out wrong. */}
        {me?.legacy && (
          <div
            style={{
              background: 'var(--warn-tint)',
              border: '1px solid #F0DFB4',
              borderRadius: 14,
              padding: '11px 13px',
              marginBottom: 12,
              fontSize: 12.5,
              lineHeight: 1.5,
              color: 'var(--warn-ink)',
            }}
          >
            Everything here is being logged as <strong>Owner</strong>. Set{' '}
            <code style={{ fontFamily: 'var(--mono), monospace', fontSize: 11.5 }}>
              ROLODECK_USERS
            </code>{' '}
            in the Vercel environment to <code style={{ fontFamily: 'var(--mono), monospace', fontSize: 11.5 }}>Name:PIN</code> pairs, then redeploy, and each PIN
            gets its own name.
          </div>
        )}
        {tab === 'events' && (
          <Events
            events={events}
            guests={guests}
            people={everyone}
            state={eventsState}
            onOpen={setOpenEventId}
          />
        )}

        {tab === 'deck' && showStats && !loading && !error && <Stats rows={rows} invites={invites} />}
        {tab === 'deck' && loading && <Empty text="Loading the deck…" />}
        {tab === 'deck' && error && <Empty text={`Couldn't load: ${error}`} />}
        {tab === 'deck' && !loading && !error && rows.length === 0 && (
          <Empty text={q ? 'No one matches that.' : 'Nobody on deck yet. Add someone below.'} />
        )}

        {tab === 'deck' &&
          rows.length > 0 &&
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
        className="glass glass-bottom"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '12px 16px calc(16px + env(safe-area-inset-bottom))',
          // the gradient scrim this replaces faded the roster out behind it;
          // cards now stay visible through the bar, just blurred
          borderTop: '1px solid var(--glass-fill)',
          maxWidth: 480,
          margin: '0 auto',
        }}
      >
        {/* one button, and it does whatever the tab you're on is for */}
        <button
          onClick={() => (tab === 'deck' ? setOpenId('new') : setOpenEventId('new'))}
          disabled={tab === 'events' && eventsState === 'missing'}
          style={{
            width: '100%',
            padding: '14px 16px',
            borderRadius: 14,
            border: 'none',
            background: tab === 'events' && eventsState === 'missing' ? 'var(--faint)' : C.accent,
            color: 'var(--surface)',
            fontSize: 15,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            boxShadow: '0 6px 20px var(--accent-glow)',
          }}
        >
          <Plus size={17} /> {tab === 'deck' ? 'Add someone' : 'New event'}
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
          events={events}
          guests={guests}
          onOpenEvent={(id) => {
            setOpenId(null);
            setTab('events');
            setOpenEventId(id);
          }}
        />
      )}

      {(openEventId === 'new' || openEvent) && (
        <EventSheet
          key={openEventId}
          event={openEvent}
          guests={guests}
          people={everyone}
          onClose={() => setOpenEventId(null)}
          onSave={saveEventThenOpen}
          onRemove={props.onRemoveEvent}
          onAddGuest={props.onAddGuest}
          onSetGuestStatus={props.onSetGuestStatus}
          onRemoveGuest={props.onRemoveGuest}
        />
      )}

      {showLog && <ActivityLog onClose={() => setShowLog(false)} />}
    </main>
  );
}

function MenuItem({ Icon, label, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        width: '100%',
        padding: '11px 13px',
        border: 'none',
        background: 'transparent',
        color: danger ? 'var(--bad)' : C.ink,
        fontSize: 14,
        textAlign: 'left',
      }}
    >
      <Icon size={15} />
      {label}
    </button>
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
              background: 'var(--accent-tint)',
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: 12,
              background: 'var(--accent-tint)',
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
            boxShadow: '0 1px 3px var(--shadow)',
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
              boxShadow: '0 1px 3px var(--shadow)',
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
      {/* the face is the fastest way to find someone in a list — worth the room */}
      <Avatar name={p.name} url={p.photo_url} size={62} />

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
                background: 'var(--tint)',
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
            color: 'var(--muted)',
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
        background: 'var(--surface)',
        border: '1px solid #E9E8EF',
        borderRadius: 16,
        padding: '38px 20px',
        textAlign: 'center',
        color: 'var(--muted)',
        fontSize: 14,
      }}
    >
      {text}
    </div>
  );
}
