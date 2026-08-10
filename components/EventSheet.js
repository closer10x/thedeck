'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Trash2, Plus, Search, MapPin, CalendarDays } from 'lucide-react';
import Avatar from './Avatar';
import { initials } from '../lib/format';

const C = { ink: '#16151C', muted: '#86848F', line: '#E9E8EF', accent: '#4B3BE0' };

// Where each guest got to. Before the night: coming or maybe. Afterwards: did
// she actually turn up — which is the part worth knowing next time.
export const STATUSES = [
  { id: 'coming', label: 'Coming', emoji: '🎟️', color: '#12805C', bg: '#E7F5F0' },
  { id: 'maybe', label: 'Maybe', emoji: '🤔', color: '#A87400', bg: '#FBF3DE' },
  { id: 'came', label: 'Came', emoji: '🎉', color: '#4B3BE0', bg: '#EEECFD' },
  { id: 'noshow', label: 'No show', emoji: '👻', color: '#D6336C', bg: '#FCEBF1' },
];

// date inputs speak yyyy-mm-dd in local time; toISOString() would hand back UTC
// and shift the day for anyone west of Greenwich
function toDateInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fromDateInput(s) {
  const [y, m, d] = (s || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12).toISOString(); // midday, so no zone rolls it back
}

export default function EventSheet({
  event,
  guests,
  people,
  onSave,
  onRemove,
  onAddGuest,
  onSetGuestStatus,
  onRemoveGuest,
  onClose,
}) {
  const [draft, setDraft] = useState(
    event || { name: '', at: null, place: '', note: '' }
  );
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState('');
  const [places, setPlaces] = useState([]);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  // Autosave, same as the person sheet: edits settle and persist themselves.
  // Only once she exists — a new event needs a name and a deliberate Create.
  const saved = useRef(JSON.stringify(event || {}));
  const timer = useRef(null);
  useEffect(() => {
    if (!event?.id) return;
    const body = JSON.stringify(draft);
    if (body === saved.current) return;
    timer.current = setTimeout(() => {
      saved.current = body;
      onSave({ ...draft, id: event.id });
    }, 700);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const placesSeq = useRef(0);
  function onPlaceChange(v) {
    set('place', v);
    const seq = ++placesSeq.current;
    clearTimeout(placesSeq.timer);
    placesSeq.timer = setTimeout(async () => {
      if (v.trim().length < 3) return setPlaces([]);
      try {
        const r = await fetch(`/api/places?q=${encodeURIComponent(v)}`);
        const out = await r.json();
        if (seq === placesSeq.current) setPlaces(out.suggestions || []);
      } catch {
        setPlaces([]);
      }
    }, 300);
  }

  async function create() {
    if (!draft.name.trim()) {
      setMsg('The event needs a name.');
      return;
    }
    setSaving(true);
    setMsg('');
    const res = await onSave(draft);
    setSaving(false);
    if (res?.error) setMsg(res.error);
  }

  const onList = guests.filter((g) => g.event_id === event?.id);
  const onListIds = new Set(onList.map((g) => g.person_id));

  // Who to offer. Anyone already on it is out. The rest are ordered by how
  // recently she said yes — this whole feature exists because someone did, and
  // she's who you're looking for when you open this.
  const candidates = people
    .filter((p) => !p.archived && !onListIds.has(p.id))
    .map((p) => {
      const yes = (p.invites || []).filter((i) => i.outcome === 'yes');
      const lastYes = yes.length ? new Date(yes[0].invited_at).getTime() : 0;
      return { ...p, lastYes };
    })
    .filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => b.lastYes - a.lastYes || a.name.localeCompare(b.name));

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(22,21,28,0.32)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 20,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <style>{`@keyframes evUp { from { transform: translateY(26px); opacity:.6 } to { transform:none; opacity:1 } }`}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 480,
          maxHeight: '92dvh',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          background: '#fff',
          borderRadius: '20px 20px 0 0',
          padding: '10px 16px calc(24px + env(safe-area-inset-bottom))',
          animation: 'evUp 300ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 12px' }}>
          <div style={{ width: 38, height: 4, borderRadius: 2, background: C.line }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            value={draft.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="What is it? Rooftop dinner…"
            autoFocus={!event}
            style={{
              flex: 1,
              minWidth: 0,
              border: 'none',
              outline: 'none',
              fontFamily: 'var(--display), sans-serif',
              fontSize: 21,
              fontWeight: 700,
              letterSpacing: '-0.03em',
              color: C.ink,
            }}
          />
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ border: 'none', background: 'transparent', color: C.muted, padding: 4, display: 'flex' }}
          >
            <X size={19} />
          </button>
        </div>

        <Label>When</Label>
        <div style={{ position: 'relative' }}>
          <CalendarDays
            size={15}
            color={C.muted}
            style={{ position: 'absolute', left: 12, top: 13, pointerEvents: 'none' }}
          />
          <input
            type="date"
            value={toDateInput(draft.at)}
            onChange={(e) => set('at', fromDateInput(e.target.value))}
            style={{ ...inputStyle, paddingLeft: 34 }}
          />
        </div>
        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 5 }}>
          Leave it empty if it&apos;s still a someday.
        </div>

        <Label>Where</Label>
        <div style={{ position: 'relative' }}>
          <MapPin
            size={15}
            color={C.muted}
            style={{ position: 'absolute', left: 12, top: 13, pointerEvents: 'none' }}
          />
          <input
            value={draft.place || ''}
            onChange={(e) => onPlaceChange(e.target.value)}
            onBlur={() => setTimeout(() => setPlaces([]), 150)}
            placeholder="Bar, restaurant, someone's roof"
            style={{ ...inputStyle, paddingLeft: 34 }}
          />
          {places.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                zIndex: 3,
                marginTop: 4,
                background: '#fff',
                border: `1px solid ${C.line}`,
                borderRadius: 12,
                boxShadow: '0 12px 30px rgba(22,21,28,0.14)',
                overflow: 'hidden',
              }}
            >
              {places.map((p, i) => (
                <button
                  key={i}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    set('place', p.main);
                    setPlaces([]);
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 12px',
                    border: 'none',
                    background: 'transparent',
                    fontSize: 13.5,
                  }}
                >
                  <div style={{ color: C.ink }}>{p.main}</div>
                  {p.secondary && (
                    <div style={{ fontSize: 11.5, color: C.muted }}>{p.secondary}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <Label>Note</Label>
        <textarea
          value={draft.note || ''}
          onChange={(e) => set('note', e.target.value)}
          rows={2}
          placeholder="Reservation at 8, bring cash…"
          style={{ ...inputStyle, resize: 'none', lineHeight: 1.45 }}
        />

        {!event ? (
          <>
            {msg && <div style={{ fontSize: 12.5, color: '#D6336C', marginTop: 10 }}>{msg}</div>}
            <button
              onClick={create}
              disabled={saving}
              style={{
                width: '100%',
                marginTop: 16,
                padding: '13px 0',
                borderRadius: 14,
                border: 'none',
                background: C.accent,
                color: '#fff',
                fontSize: 15,
                fontWeight: 600,
              }}
            >
              {saving ? 'Creating…' : 'Create event'}
            </button>
            <div style={{ fontSize: 12, color: C.muted, textAlign: 'center', marginTop: 9 }}>
              You can add people once it exists.
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Label>
                Who&apos;s coming {onList.length > 0 && `· ${onList.length}`}
              </Label>
              <button
                onClick={() => {
                  setPicking((v) => !v);
                  setQ('');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  border: 'none',
                  background: 'transparent',
                  padding: '0 0 6px',
                  color: C.accent,
                  fontSize: 12.5,
                  fontWeight: 600,
                }}
              >
                <Plus size={14} /> Add someone
              </button>
            </div>

            {picking && (
              <div
                style={{
                  border: `1px solid ${C.line}`,
                  borderRadius: 14,
                  padding: 10,
                  marginBottom: 10,
                  background: '#FAF9FC',
                }}
              >
                <div style={{ position: 'relative' }}>
                  <Search
                    size={14}
                    color={C.muted}
                    style={{ position: 'absolute', left: 11, top: 11, pointerEvents: 'none' }}
                  />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search the deck"
                    autoFocus
                    style={{ ...inputStyle, background: '#fff', paddingLeft: 32, padding: '9px 12px 9px 32px' }}
                  />
                </div>

                <div style={{ maxHeight: 232, overflowY: 'auto', marginTop: 8 }}>
                  {candidates.length === 0 && (
                    <div style={{ fontSize: 12.5, color: C.muted, padding: '10px 2px' }}>
                      {q ? 'Nobody matches that.' : 'Everyone on the deck is already on this one.'}
                    </div>
                  )}
                  {candidates.map((p) => (
                    <button
                      key={p.id}
                      onClick={async () => {
                        await onAddGuest(event.id, p.id);
                        setQ('');
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        width: '100%',
                        padding: '8px 4px',
                        border: 'none',
                        background: 'transparent',
                        textAlign: 'left',
                      }}
                    >
                      <Avatar name={p.name} url={p.photo_url} size={32} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: C.ink }}>{p.name}</span>
                      {/* why she's near the top */}
                      {p.lastYes > 0 && (
                        <span
                          style={{
                            fontFamily: 'var(--mono), monospace',
                            fontSize: 9.5,
                            color: '#12805C',
                            background: '#E7F5F0',
                            borderRadius: 6,
                            padding: '2px 6px',
                          }}
                        >
                          said yes
                        </span>
                      )}
                      <Plus size={15} color={C.accent} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {onList.length === 0 && !picking && (
              <div style={{ fontSize: 13, color: C.muted, padding: '6px 0 4px' }}>
                Nobody yet. Add whoever said yes.
              </div>
            )}

            {onList.map((g) => {
              const person = people.find((p) => p.id === g.person_id);
              return (
                <div
                  key={g.id}
                  style={{
                    background: '#FAF9FC',
                    border: `1px solid ${C.line}`,
                    borderRadius: 13,
                    padding: '10px 11px',
                    marginBottom: 7,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar name={person?.name || '?'} url={person?.photo_url} size={34} />
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 14.5,
                        fontWeight: 550,
                        color: C.ink,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {person?.name || 'Someone off the deck'}
                    </span>
                    <button
                      onClick={() => onRemoveGuest(g.id)}
                      aria-label={`Take ${person?.name || 'her'} off`}
                      style={{ border: 'none', background: 'transparent', color: '#C9C7D2', padding: 2, display: 'flex' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: 5, marginTop: 9, flexWrap: 'wrap' }}>
                    {STATUSES.map((s) => {
                      const on = g.status === s.id;
                      return (
                        <button
                          key={s.id}
                          onClick={() => onSetGuestStatus(g.id, s.id)}
                          title={s.label}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: on ? '5px 10px' : '5px 8px',
                            borderRadius: 999,
                            border: `1px solid ${on ? s.color + '55' : 'transparent'}`,
                            background: on ? s.bg : 'transparent',
                            color: on ? s.color : C.muted,
                            fontSize: 12,
                            fontWeight: on ? 600 : 500,
                            opacity: on ? 1 : 0.55,
                          }}
                        >
                          <span style={{ fontSize: 12.5, lineHeight: 1 }}>{s.emoji}</span>
                          {on && s.label}
                        </button>
                      );
                    })}
                  </div>

                  {g.created_by && (
                    <div
                      style={{
                        fontFamily: 'var(--mono), monospace',
                        fontSize: 10,
                        color: C.muted,
                        marginTop: 7,
                      }}
                    >
                      Added by {g.created_by}
                    </div>
                  )}
                </div>
              );
            })}

            {event.created_by && (
              <div
                style={{
                  fontFamily: 'var(--mono), monospace',
                  fontSize: 10,
                  color: C.muted,
                  textAlign: 'center',
                  marginTop: 16,
                }}
              >
                Created by {event.created_by}
              </div>
            )}

            {!confirmRemove ? (
              <button
                onClick={() => setConfirmRemove(true)}
                style={{
                  width: '100%',
                  marginTop: 10,
                  padding: '12px 0',
                  borderRadius: 14,
                  border: `1px solid ${C.line}`,
                  background: '#fff',
                  color: '#D6336C',
                  fontSize: 14,
                  fontWeight: 500,
                }}
              >
                Delete event
              </button>
            ) : (
              <div
                style={{
                  marginTop: 12,
                  border: '1px solid #F3D3DF',
                  background: '#FDF6F9',
                  borderRadius: 14,
                  padding: 13,
                }}
              >
                <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.5 }}>
                  This deletes {draft.name || 'the event'}
                  {onList.length > 0 && ` and takes ${onList.length} ${onList.length === 1 ? 'person' : 'people'} off it`}
                  . Nobody leaves the deck.
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button
                    onClick={() => setConfirmRemove(false)}
                    style={{
                      flex: 1,
                      padding: '11px 0',
                      borderRadius: 12,
                      border: `1px solid ${C.line}`,
                      background: '#fff',
                      color: C.ink,
                      fontSize: 13.5,
                      fontWeight: 600,
                    }}
                  >
                    Keep it
                  </button>
                  <button
                    onClick={() => {
                      onRemove(event.id);
                      onClose();
                    }}
                    style={{
                      flex: 1,
                      padding: '11px 0',
                      borderRadius: 12,
                      border: 'none',
                      background: '#D6336C',
                      color: '#fff',
                      fontSize: 13.5,
                      fontWeight: 600,
                    }}
                  >
                    Yes, delete
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '11px 12px',
  borderRadius: 11,
  border: '1px solid #E9E8EF',
  background: '#F7F6FA',
  fontSize: 14,
};

function Label({ children }) {
  return (
    <div
      style={{
        fontFamily: 'var(--mono), monospace',
        fontSize: 10,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: '#A9A7B3',
        margin: '20px 0 8px',
      }}
    >
      {children}
    </div>
  );
}
