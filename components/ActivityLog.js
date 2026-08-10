'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  ImagePlus,
  LogIn,
  Lock,
  MessageSquare,
  Pencil,
  Send,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { ago, initials } from '../lib/format';

const C = {
  surface: '#FFFFFF',
  ink: '#16151C',
  muted: '#86848F',
  line: '#E9E8EF',
  accent: '#4B3BE0',
  bad: '#D6336C',
};

// Each kind of entry gets a glyph and a colour, so the feed can be skimmed for
// "what happened" before any of it is actually read.
const LOOK = {
  'person.add': { Icon: UserPlus, color: '#12805C', bg: '#E7F5F0' },
  'person.update': { Icon: Pencil, color: '#4B3BE0', bg: '#EEECFD' },
  'person.remove': { Icon: Trash2, color: C.bad, bg: '#FCEBF1' },
  'person.archive': { Icon: Archive, color: '#A87400', bg: '#FBF3DE' },
  'person.unarchive': { Icon: ArchiveRestore, color: '#12805C', bg: '#E7F5F0' },
  'ask.add': { Icon: Send, color: '#4B3BE0', bg: '#EEECFD' },
  'ask.outcome': { Icon: CheckCircle2, color: '#12805C', bg: '#E7F5F0' },
  'ask.note': { Icon: MessageSquare, color: '#86848F', bg: '#F1F0F5' },
  'ask.remove': { Icon: Trash2, color: C.bad, bg: '#FCEBF1' },
  'photo.add': { Icon: ImagePlus, color: '#4B3BE0', bg: '#EEECFD' },
  'photo.avatar': { Icon: ImagePlus, color: '#4B3BE0', bg: '#EEECFD' },
  'session.unlock': { Icon: LogIn, color: '#86848F', bg: '#F1F0F5' },
  'session.lock': { Icon: Lock, color: '#86848F', bg: '#F1F0F5' },
};

const FALLBACK = { Icon: Pencil, color: '#86848F', bg: '#F1F0F5' };

function dayLabel(iso) {
  const d = new Date(iso);
  const midnight = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((midnight(new Date()) - midnight(d)) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  const opts = { weekday: 'long', month: 'short', day: 'numeric' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString(undefined, opts);
}

// The whole history, or one person's. Read-only by design: there is no endpoint
// that edits an entry, so nothing in here offers to.
export default function ActivityLog({ personId = null, title = 'Activity', onClose }) {
  const [entries, setEntries] = useState([]);
  const [state, setState] = useState('loading'); // loading | ready | missing | error | offline
  const [message, setMessage] = useState('');
  const [who, setWho] = useState('all');
  const [showSessions, setShowSessions] = useState(false);
  // bumping this re-runs the load — what Try again does
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setState('loading');
    (async () => {
      try {
        const url = personId ? `/api/activity?person_id=${encodeURIComponent(personId)}` : '/api/activity';
        const r = await fetch(url);

        // Being locked out mid-session comes back as a status, not a body we
        // can read — say so plainly rather than "Unexpected token <".
        if (r.status === 401) {
          if (alive) {
            setState('error');
            setMessage('Your session timed out. Close this and enter your PIN again.');
          }
          return;
        }

        const out = await r.json();
        if (!alive) return;

        // the table not being there yet is a setup step, not a failure
        if (out.missing) {
          setState('missing');
          return;
        }
        if (out.error) {
          setState('error');
          setMessage(out.error);
          return;
        }
        setEntries(out.entries || []);
        setState('ready');
      } catch {
        // fetch rejects rather than resolving when nothing answers — a dropped
        // connection, or a dev server that isn't running any more. "Failed to
        // fetch" is the browser's words for it and tells you nothing.
        if (!alive) return;
        setState('offline');
      }
    })();
    return () => {
      alive = false;
    };
  }, [personId, attempt]);

  const actors = useMemo(
    () => Array.from(new Set(entries.map((e) => e.actor).filter(Boolean))).sort(),
    [entries]
  );

  // Signing in and out is a fact about the session, not about anyone on the
  // deck, and there are far more of them than there are changes — left in, they
  // bury the entries you opened this to read. Still here, one tap away.
  const sessions = entries.filter((e) => e.action.startsWith('session.')).length;

  const shown = entries
    .filter((e) => showSessions || !e.action.startsWith('session.'))
    .filter((e) => who === 'all' || e.actor === who);

  // one heading per day, in the order the entries already arrive (newest first)
  const groups = useMemo(() => {
    const out = [];
    for (const e of shown) {
      const label = dayLabel(e.at);
      if (!out.length || out[out.length - 1].label !== label) out.push({ label, items: [] });
      out[out.length - 1].items.push(e);
    }
    return out;
  }, [shown]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(22,21,28,0.32)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 30,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <style>{`@keyframes logUp { from { transform: translateY(24px); opacity: .6 } to { transform: none; opacity: 1 } }`}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 480,
          maxHeight: '88dvh',
          display: 'flex',
          flexDirection: 'column',
          background: C.surface,
          borderRadius: '20px 20px 0 0',
          animation: 'logUp 280ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <div style={{ padding: '10px 16px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 12px' }}>
            <div style={{ width: 38, height: 4, borderRadius: 2, background: C.line }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2
              style={{
                margin: 0,
                fontFamily: 'var(--display), sans-serif',
                fontSize: 21,
                fontWeight: 700,
                letterSpacing: '-0.03em',
                color: C.ink,
              }}
            >
              {title}
            </h2>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{ border: 'none', background: 'transparent', color: C.muted, padding: 4, display: 'flex' }}
            >
              <X size={19} />
            </button>
          </div>

          {/* who did what — only worth showing once more than one person has */}
          {(actors.length > 1 || sessions > 0) && (
            <div style={{ display: 'flex', gap: 6, marginTop: 12, overflowX: 'auto', scrollbarWidth: 'none' }}>
              {actors.length > 1 &&
                ['all', ...actors].map((a) => {
                  const on = who === a;
                  return (
                    <button
                      key={a}
                      onClick={() => setWho(a)}
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
                      {a === 'all' ? 'Everyone' : a}
                    </button>
                  );
                })}
              {sessions > 0 && (
                <button
                  onClick={() => setShowSessions((v) => !v)}
                  style={{
                    flexShrink: 0,
                    marginLeft: actors.length > 1 ? 'auto' : 0,
                    padding: '6px 11px',
                    borderRadius: 999,
                    border: `1px solid ${showSessions ? C.accent : C.line}`,
                    background: showSessions ? C.accent : C.surface,
                    color: showSessions ? '#fff' : C.muted,
                    fontSize: 12.5,
                    fontWeight: 500,
                  }}
                >
                  {showSessions ? 'Hide sign-ins' : `Sign-ins (${sessions})`}
                </button>
              )}
            </div>
          )}
        </div>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            padding: '14px 16px calc(24px + env(safe-area-inset-bottom))',
          }}
        >
          {state === 'loading' && <Note>Reading the log…</Note>}
          {state === 'error' && <Note>{message}</Note>}
          {state === 'offline' && (
            <Note>
              Couldn&apos;t reach the server. The log is safe — this is the connection.
              <button
                onClick={() => setAttempt((n) => n + 1)}
                style={{
                  display: 'block',
                  margin: '12px auto 0',
                  padding: '8px 16px',
                  borderRadius: 999,
                  border: `1px solid ${C.line}`,
                  background: C.surface,
                  color: C.accent,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Try again
              </button>
            </Note>
          )}
          {state === 'missing' && (
            <Note>
              The log table isn&apos;t set up yet. Paste{' '}
              <code style={{ fontFamily: 'var(--mono), monospace', fontSize: 12 }}>
                supabase/activity-log.sql
              </code>{' '}
              into the Supabase SQL editor and everything from then on gets written down here.
            </Note>
          )}
          {state === 'ready' && !shown.length && (
            <Note>{who === 'all' ? 'Nothing logged yet.' : `Nothing from ${who} yet.`}</Note>
          )}

          {groups.map((g) => (
            <div key={g.label} style={{ marginBottom: 18 }}>
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
                {g.label}
              </div>
              {g.items.map((e) => (
                <Entry key={e.id} entry={e} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Entry({ entry }) {
  const { Icon, color, bg } = LOOK[entry.action] || FALLBACK;
  return (
    <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start', padding: '7px 0' }}>
      <span
        style={{
          flexShrink: 0,
          width: 30,
          height: 30,
          borderRadius: 10,
          background: bg,
          color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={15} />
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.4 }}>{entry.detail}</div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 3,
            fontFamily: 'var(--mono), monospace',
            fontSize: 10.5,
            color: C.muted,
          }}
        >
          {/* the point of the whole feature: whose hand it was */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: '#F1F0F5',
              borderRadius: 6,
              padding: '2px 6px',
              color: '#5F5D6B',
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 9.5 }}>{initials(entry.actor) || '?'}</span>
            {entry.actor}
          </span>
          <span>{ago(entry.at)}</span>
          {/* Reconstructed from the row's own timestamp, not something the log
              was running for. Worth saying, or the log overstates itself. */}
          {entry.meta?.backfilled && (
            <span title="Reconstructed from her record — this predates the log" style={{ opacity: 0.75 }}>
              · from record
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Note({ children }) {
  return (
    <div
      style={{
        border: `1px solid ${C.line}`,
        borderRadius: 14,
        padding: '22px 18px',
        textAlign: 'center',
        color: C.muted,
        fontSize: 13.5,
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}
