'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  X,
  Instagram,
  Loader2,
  Trash2,
  Check,
  Camera,
  Phone,
  Plus,
  CalendarDays,
} from 'lucide-react';
import Avatar from './Avatar';
import { parseHandle, formatUSPhone, OUTCOME_EMOJI } from '../lib/format';

const C = { ink: '#16151C', muted: '#86848F', line: '#E9E8EF', accent: '#4B3BE0' };

const OUTCOMES = [
  { id: 'pending', label: 'Waiting', color: '#6E6C78', bg: '#F1F0F5' },
  { id: 'yes', label: 'Yes', color: '#12805C', bg: '#E7F5F0' },
  { id: 'no', label: 'No', color: '#D6336C', bg: '#FCEBF1' },
  { id: 'ghost', label: 'Ghosted', color: '#A87400', bg: '#FBF3DE' },
];

// date inputs speak yyyy-mm-dd in local time; toISOString() would hand back
// UTC and shift the day for anyone west of Greenwich
function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dateFromISO(s) {
  const [y, m, d] = (s || '').split('-').map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d, 12); // midday, so no timezone can roll it back
}

// Instagram throttles the profile endpoint by IP and says so plainly, so a
// blank grid usually means "wait", not "she has no photos". Worth the words.
function gridMessage(data) {
  if (data.posts?.length) return '';
  switch (data.status) {
    case 'rate_limited':
      return data.photo_url
        ? 'Photo saved. Instagram is rate-limiting the grid — try again in a few minutes.'
        : 'Instagram is rate-limiting right now. Try again in a few minutes.';
    case 'private':
      return 'Her account is private, so no grid. Add her photos yourself below.';
    case 'not_found':
      return 'No account by that handle.';
    default:
      return data.photo_url ? '' : 'Nothing came back. Add her photos yourself below.';
  }
}

export default function PersonSheet({
  person,
  onClose,
  onSave,
  onRemove,
  onLogInvite,
  onSetOutcome,
  onDeleteInvite,
}) {
  const [draft, setDraft] = useState(
    person || {
      name: '',
      ig_handle: '',
      photos: [],
      phone: '',
      photo_url: '',
      note: '',
      rat_chat: false,
    }
  );
  const [paste, setPaste] = useState(person?.ig_handle ? `@${person.ig_handle}` : '');
  const [fetching, setFetching] = useState(false);
  const [photoMsg, setPhotoMsg] = useState('');
  const [what, setWhat] = useState('');
  // the field collapses to an icon once there's a handle; tap it to edit
  const [igOpen, setIgOpen] = useState(!person?.ig_handle);
  const [uploading, setUploading] = useState(false);
  const [addingPhotos, setAddingPhotos] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [places, setPlaces] = useState([]);
  const [placesMsg, setPlacesMsg] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [passRequired, setPassRequired] = useState(false);
  const [passAttempt, setPassAttempt] = useState('');
  const [removeMsg, setRemoveMsg] = useState('');
  const [removing, setRemoving] = useState(false);
  const dateRef = useRef(null);
  const placesSeq = useRef(0);
  const [showDate, setShowDate] = useState(false);
  const [when, setWhen] = useState(todayISO);
  const placesTimer = useRef(null);
  const fileRef = useRef(null);
  const gridRef = useRef(null);
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  const photos = draft.photos || [];

  // --- drag-to-dismiss -----------------------------------------------------
  // The sheet slides up on open, follows your thumb down, and either snaps back
  // or keeps going. Pulling up is resisted so it can't be dragged off the top.
  const [entered, setEntered] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [closing, setClosing] = useState(false);
  const dragStart = useRef(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const requestClose = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 260); // let it finish sliding before it unmounts
  }, [onClose]);

  function onGrabStart(e) {
    dragStart.current = { y: e.clientY, t: Date.now() };
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onGrabMove(e) {
    if (!dragStart.current) return;
    const dy = e.clientY - dragStart.current.y;
    setDragY(dy > 0 ? dy : dy / 4); // rubber-band upward
  }

  function onGrabEnd() {
    if (!dragStart.current) return;
    const elapsed = Date.now() - dragStart.current.t;
    const velocity = dragY / Math.max(elapsed, 1); // px per ms
    dragStart.current = null;
    setDragging(false);
    // a decisive flick counts even if it didn't travel far
    if (dragY > 110 || velocity > 0.6) requestClose();
    else setDragY(0);
  }

  const sheetY = closing ? '100%' : entered ? `${Math.max(dragY, 0)}px` : '100%';
  const backdropFade = closing ? 0 : Math.max(0, 1 - Math.max(dragY, 0) / 320);

  // No Save button anywhere: edits settle for a beat, then persist. The first
  // write for a new person creates her row, and `person` arrives on the next
  // render so subsequent edits update rather than inserting a duplicate.
  const savedSnapshot = useRef(JSON.stringify(person || null));
  const createdId = useRef(person?.id || null);
  useEffect(() => {
    if (!(draft.name || '').trim()) return; // nothing to create her by yet
    const body = JSON.stringify(draft);
    if (body === savedSnapshot.current) return;

    const t = setTimeout(async () => {
      savedSnapshot.current = body;
      setSaveState('saving');
      const res = (await onSave({ ...draft, id: person?.id || createdId.current })) || {};
      // hold onto the id the insert handed back, or the next keystroke inserts
      // her a second time
      if (res.id) createdId.current = res.id;
      setSaveState(res.error ? 'error' : 'saved');
      setSaveMsg(res.error ? `Could not save: ${res.error}` : '');
      if (!res.error) setTimeout(() => setSaveState('idle'), 1400);
    }, 700);
    return () => clearTimeout(t);
  }, [draft, onSave, person?.id]);

  // Google Places, debounced so a burst of keystrokes is one billed call.
  // Silent by design: no key, no network, no suggestions — just a text box.
  function onWhatChange(value) {
    setWhat(value);
    clearTimeout(placesTimer.current);
    if (value.trim().length < 3) {
      setPlaces([]);
      return;
    }
    const seq = ++placesSeq.current;
    placesTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/places?q=${encodeURIComponent(value)}`);
        const out = await r.json();
        // responses can land out of order; only the newest may paint
        if (seq !== placesSeq.current) return;
        setPlaces(out.suggestions || []);
        // no key is a deliberate off switch and stays quiet; a key that Google
        // rejects is a misconfiguration worth naming
        setPlacesMsg(out.reason === 'upstream' ? 'Places API (New) is not enabled on that key.' : '');
      } catch {
        setPlaces([]);
      }
    }, 300);
  }

  // deleting her and every ask is the one irreversible thing in here, so it
  // asks first — and asks for the passcode too when one is configured
  async function openRemove() {
    setConfirmRemove(true);
    setRemoveMsg('');
    setPassAttempt('');
    try {
      const r = await fetch('/api/verify');
      setPassRequired((await r.json()).required);
    } catch {
      setPassRequired(false);
    }
  }

  async function doRemove() {
    if (removing) return;
    setRemoving(true);
    setRemoveMsg('');
    try {
      const r = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ attempt: passAttempt }),
      });
      const out = await r.json();
      if (!out.ok) {
        setRemoveMsg(passAttempt ? 'Wrong PIN.' : 'Enter your PIN to remove her.');
        setRemoving(false);
        return;
      }
    } catch {
      setRemoveMsg('Could not reach the server.');
      setRemoving(false);
      return;
    }
    onRemove(person.id);
    requestClose();
  }

  function submitInvite() {
    if (!person) return;
    onLogInvite(person.id, what, 'pending', dateFromISO(when));
    setWhat('');
    setPlaces([]);
    setWhen(todayISO());
    setShowDate(false);
  }

  // Backspacing a "(" or "-" deletes a character the mask puts straight back,
  // so the key reads as dead. When the digits didn't change, take out the digit
  // sitting just before the cursor — which is what you meant to remove.
  function onPhoneChange(e) {
    const raw = e.target.value;
    const caret = e.target.selectionStart ?? raw.length;
    const prevDigits = (draft.phone || '').replace(/\D/g, '');
    let digits = raw.replace(/\D/g, '');

    if (raw.length < (draft.phone || '').length && digits === prevDigits) {
      const before = raw.slice(0, caret).replace(/\D/g, '').length;
      digits = digits.slice(0, Math.max(0, before - 1)) + digits.slice(before);
    }
    set('phone', formatUSPhone(digits));
  }

  // no Instagram to pull from? fill the same six squares by hand. rides the
  // same /api/upload the avatar uses, so storage RLS never enters into it.
  async function onAddPhotos(e) {
    const picked = Array.from(e.target.files || []).slice(0, 6 - photos.length);
    e.target.value = '';
    if (!picked.length) return;
    setAddingPhotos(true);
    setPhotoMsg('');

    const added = [];
    for (const file of picked) {
      try {
        const body = new FormData();
        body.append('file', file);
        const r = await fetch('/api/upload', { method: 'POST', body });
        const out = await r.json();
        if (out.photo_url) added.push({ url: out.photo_url, source: 'upload' });
        else setPhotoMsg(`Upload failed: ${out.error || 'unknown error'}`);
      } catch (err) {
        setPhotoMsg(`Upload failed: ${err.message}`);
      }
    }
    if (added.length) set('photos', [...photos, ...added].slice(0, 6));
    setAddingPhotos(false);
  }

  // tap the avatar -> pick from camera roll, straight into Supabase Storage
  async function onPickPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPhotoMsg('That file is not an image.');
      return;
    }
    setUploading(true);
    setPhotoMsg('');
    try {
      const body = new FormData();
      body.append('file', file);
      const r = await fetch('/api/upload', { method: 'POST', body });
      const out = await r.json();
      if (out.photo_url) set('photo_url', out.photo_url);
      else setPhotoMsg(`Upload failed: ${out.error || 'unknown error'}`);
    } catch (err) {
      setPhotoMsg(`Upload failed: ${err.message}`);
    }
    setUploading(false);
  }

  async function pullPhoto(value) {
    const handle = parseHandle(value ?? paste);
    if (!handle) {
      setPhotoMsg('Paste an Instagram link or @handle.');
      return;
    }
    set('ig_handle', handle);
    setFetching(true);
    setPhotoMsg('');
    try {
      const r = await fetch('/api/ig', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: handle }),
      });
      const data = await r.json();
      // fill the name only if it's still blank — never overwrite what you typed
      if (data.name && !(draft.name || '').trim()) set('name', data.name);
      const pulled = (data.posts || []).map((p) => ({ ...p, source: 'ig' }));
      // her own grid replaces whatever was pulled before, but never the shots
      // that were uploaded by hand
      // no posts means throttled or locked, not "she deleted everything" —
      // keep what's already there rather than clearing the grid
      const nextPhotos = pulled.length
        ? [...(draft.photos || []).filter((p) => p.source !== 'ig'), ...pulled].slice(0, 6)
        : draft.photos || [];
      if (pulled.length) set('photos', nextPhotos);
      if (data.photo_url) {
        set('photo_url', data.photo_url);
        setIgOpen(false);
      }

      // a pull is real work — persist it now rather than losing it if the sheet
      // gets dismissed. only for someone already saved; a new person has no row
      // yet and gets written when you hit Save.
      if (person?.id && (pulled.length || data.photo_url)) {
        onSave({
          ...draft,
          id: person.id,
          ig_handle: handle,
          photos: nextPhotos,
          photo_url: data.photo_url || draft.photo_url,
          photos_synced_at: new Date().toISOString(),
        });
      }
      // the avatar and the grid come from different places, so say which half
      // fell over rather than leaving an empty grid with no explanation
      setPhotoMsg(gridMessage(data));
    } catch {
      setPhotoMsg('Instagram did not answer. Add her photos yourself below.');
    }
    setFetching(false);
  }

  // pasting a profile link fills the handle and grabs the photo in one move
  function onPaste(e) {
    const text = e.clipboardData.getData('text');
    if (parseHandle(text)) {
      e.preventDefault();
      setPaste(text);
      pullPhoto(text);
    }
  }

  const invites = person?.invites || [];

  return (
    <div
      onClick={requestClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: `rgba(22,21,28,${0.32 * backdropFade})`,
        transition: dragging ? 'none' : 'background 260ms ease',
        zIndex: 20,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
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
          transform: `translateY(${sheetY})`,
          // no transition mid-drag or it lags a finger's width behind
          transition: dragging
            ? 'none'
            : 'transform 300ms cubic-bezier(0.22, 1, 0.36, 1)',
          willChange: 'transform',
        }}
      >
        {/* grabber — the drag target, with room around it for a thumb */}
        <div
          onPointerDown={onGrabStart}
          onPointerMove={onGrabMove}
          onPointerUp={onGrabEnd}
          onPointerCancel={onGrabEnd}
          style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '4px 0 12px',
            cursor: 'grab',
            touchAction: 'none',
          }}
        >
          <div
            style={{
              width: 38,
              height: 4,
              borderRadius: 2,
              background: dragging ? '#C9C7D2' : '#E9E8EF',
              transition: 'background 150ms',
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={onPickPhoto}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            aria-label="Change photo"
            style={{
              position: 'relative',
              border: 'none',
              background: 'transparent',
              padding: 0,
              lineHeight: 0,
              flexShrink: 0,
            }}
          >
            <Avatar name={draft.name} url={draft.photo_url} size={62} />
            <span
              style={{
                position: 'absolute',
                right: -2,
                bottom: -2,
                width: 23,
                height: 23,
                borderRadius: '50%',
                background: '#fff',
                border: `1px solid ${C.line}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 1px 4px rgba(22,21,28,0.12)',
              }}
            >
              {uploading ? (
                <Loader2 size={12} color={C.accent} className="spin" />
              ) : (
                <Camera size={12} color={C.accent} />
              )}
            </span>
            {uploading && (
              <span
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.6)',
                }}
              />
            )}
          </button>
          <input
            value={draft.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Name"
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              fontFamily: 'var(--display), sans-serif',
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: '-0.03em',
              padding: 0,
            }}
          />
          <button
            onClick={requestClose}
            aria-label="Close"
            style={{ border: 'none', background: 'transparent', color: C.muted, padding: 4 }}
          >
            <X size={20} />
          </button>
        </div>

        {/* instagram */}
        <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>
          Tap the photo to upload one from your phone.
          {draft.photo_url && (
            <button
              onClick={() => set('photo_url', '')}
              style={{
                marginLeft: 8,
                border: 'none',
                background: 'transparent',
                color: '#D6336C',
                fontSize: 12,
                padding: 0,
                textDecoration: 'underline',
              }}
            >
              Remove photo
            </button>
          )}
        </div>

        <Label>Instagram</Label>
        {!igOpen ? (
          // collapsed: the grid below already says who she is, so all that's
          // left is a way back in
          <button
            onClick={() => setIgOpen(true)}
            title="Edit Instagram"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '7px 11px 7px 8px',
              borderRadius: 999,
              border: `1px solid ${C.line}`,
              background: '#F7F6FA',
              color: C.ink,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <Instagram size={15} color={C.accent} />@{draft.ig_handle}
          </button>
        ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Instagram
              size={15}
              color={C.muted}
              style={{ position: 'absolute', left: 11, top: 12, pointerEvents: 'none' }}
            />
            <input
              value={paste}
              onPaste={onPaste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder="Paste her profile link"
              style={{ ...inputStyle, paddingLeft: 33 }}
            />
          </div>
          <button
            onClick={() => pullPhoto()}
            disabled={fetching}
            style={{
              padding: '0 14px',
              borderRadius: 11,
              border: `1px solid ${C.accent}`,
              background: '#EEECFD',
              color: C.accent,
              fontSize: 13.5,
              fontWeight: 600,
            }}
          >
            {fetching ? <Loader2 size={15} className="spin" /> : 'Get photo'}
          </button>
        </div>
        )}
        {photoMsg && (
          <div style={{ fontSize: 12, color: '#C98A00', marginTop: 6 }}>{photoMsg}</div>
        )}

        {/* her grid: pulled from Instagram, or filled by hand when there isn't
            one. same six squares either way, so there's only one thing to learn */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 4,
            marginTop: 10,
          }}
        >
          {photos.map((p, i) => {
            const Tile = p.link ? 'a' : 'div';
            return (
              <div key={p.url} style={{ position: 'relative', aspectRatio: '1 / 1' }}>
                <Tile
                  {...(p.link
                    ? { href: p.link, target: '_blank', rel: 'noopener noreferrer' }
                    : {})}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'block',
                    borderRadius: 9,
                    overflow: 'hidden',
                  }}
                >
                  <img
                    src={p.url}
                    alt=""
                    loading="lazy"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      background: '#F1F0F5',
                    }}
                  />
                </Tile>
                <button
                  onClick={() =>
                    set(
                      'photos',
                      photos.filter((_, j) => j !== i)
                    )
                  }
                  title="Remove"
                  style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    width: 21,
                    height: 21,
                    borderRadius: 999,
                    border: 'none',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(22,21,28,0.62)',
                    color: '#fff',
                  }}
                >
                  <X size={12} strokeWidth={2.6} />
                </button>
              </div>
            );
          })}

          {photos.length < 6 && (
            <button
              onClick={() => gridRef.current?.click()}
              disabled={addingPhotos}
              style={{
                position: 'relative',
                aspectRatio: '1 / 1',
                padding: 0,
                border: `1.5px dashed #D8D6E2`,
                borderRadius: 9,
                background: '#F7F6FA',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 3,
                  color: C.muted,
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {addingPhotos ? (
                  <Loader2 size={17} className="spin" />
                ) : (
                  <>
                    <Plus size={17} />
                    {photos.length === 0 ? 'Add photos' : 'Add'}
                  </>
                )}
              </span>
            </button>
          )}
        </div>
        <input
          ref={gridRef}
          type="file"
          accept="image/*"
          multiple
          onChange={onAddPhotos}
          style={{ display: 'none' }}
        />

        <Label>Phone</Label>
        <div style={{ position: 'relative' }}>
          <Phone
            size={15}
            color={C.muted}
            style={{ position: 'absolute', left: 11, top: 12, pointerEvents: 'none' }}
          />
          <input
            value={draft.phone || ''}
            onChange={onPhoneChange}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="Her number"
            style={{ ...inputStyle, paddingLeft: 33 }}
          />
        </div>

        {/* rat chat */}
        <Label>Rat Chat</Label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14.5, flex: 1 }}>{'\uD83D\uDC00'} In the rat chat?</span>
          {[
            { v: true, label: 'Yes', color: '#12805C', bg: '#E7F5F0' },
            { v: false, label: 'No', color: '#5E5C6B', bg: '#F1F0F5' },
          ].map((o) => {
            const on = !!draft.rat_chat === o.v;
            return (
              <button
                key={o.label}
                onClick={() => set('rat_chat', o.v)}
                style={{
                  minWidth: 66,
                  padding: '9px 0',
                  borderRadius: 11,
                  border: `1px solid ${on ? o.color : C.line}`,
                  background: on ? o.bg : '#fff',
                  color: on ? o.color : C.muted,
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                {o.label}
              </button>
            );
          })}
        </div>

        {/* note */}
        <Label>Note</Label>
        <textarea
          value={draft.note || ''}
          onChange={(e) => set('note', e.target.value)}
          rows={3}
          placeholder="Where you met, what she's into, what to bring up next time"
          style={{ ...inputStyle, resize: 'none', lineHeight: 1.45 }}
        />

        {/* invites */}
        {person && (
          <>
            <Label>Invites</Label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  value={what}
                  onChange={(e) => onWhatChange(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitInvite()}
                  onBlur={() => setTimeout(() => setPlaces([]), 150)}
                  placeholder="Dinner Thursday, beach day…"
                  style={inputStyle}
                />
                {places.length > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      marginTop: 4,
                      zIndex: 3,
                      background: '#fff',
                      border: `1px solid ${C.line}`,
                      borderRadius: 11,
                      overflow: 'hidden',
                      boxShadow: '0 8px 24px rgba(22,21,28,0.12)',
                    }}
                  >
                    {places.map((s, i) => (
                      <button
                        key={`${s.main}-${i}`}
                        // onMouseDown, not onClick — blur fires first otherwise
                        // and closes the list out from under the tap
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setWhat(s.main);
                          setPlaces([]);
                        }}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '9px 12px',
                          border: 'none',
                          borderTop: i ? `1px solid #F0EFF4` : 'none',
                          background: '#fff',
                        }}
                      >
                        <span style={{ fontSize: 13.5, color: C.ink }}>{s.main}</span>
                        {s.secondary && (
                          <span style={{ fontSize: 11.5, color: C.muted, display: 'block' }}>
                            {s.secondary}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={() => {
                  const next = !showDate;
                  setShowDate(next);
                  // pop the native calendar straight open rather than making
                  // you find and tap the field that just appeared
                  if (next) {
                    requestAnimationFrame(() => {
                      try {
                        dateRef.current?.showPicker?.();
                      } catch {
                        dateRef.current?.focus();
                      }
                    });
                  }
                }}
                aria-label="Pick the date"
                title={showDate ? 'Use today' : 'Pick the date'}
                style={{
                  padding: '0 11px',
                  borderRadius: 11,
                  border: `1px solid ${showDate ? C.accent : C.line}`,
                  background: showDate ? '#EEECFD' : '#F7F6FA',
                  color: showDate ? C.accent : C.muted,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <CalendarDays size={16} />
              </button>

              <button
                onClick={submitInvite}
                style={{
                  padding: '0 14px',
                  borderRadius: 11,
                  border: 'none',
                  background: C.accent,
                  color: '#fff',
                  fontSize: 13.5,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                Log ask
              </button>
            </div>

            {showDate && (
              <input
                ref={dateRef}
                type="date"
                value={when}
                max={todayISO()}
                onChange={(e) => setWhen(e.target.value)}
                style={{ ...inputStyle, marginTop: 8 }}
              />
            )}
            {placesMsg && (
              <div style={{ fontSize: 11.5, color: '#C98A00', marginTop: 6 }}>{placesMsg}</div>
            )}

            <div style={{ marginTop: 10 }}>
              {invites.length === 0 && (
                <div style={{ fontSize: 13, color: C.muted, padding: '8px 0' }}>
                  Never asked. That's the whole point of the list.
                </div>
              )}
              {invites.map((inv) => {
                return (
                  <div
                    key={inv.id}
                    style={{
                      background: '#FAF9FC',
                      border: `1px solid ${C.line}`,
                      borderRadius: 13,
                      padding: '11px 12px',
                      marginBottom: 7,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13.5,
                          fontWeight: 550,
                          color: C.ink,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {inv.what || 'Asked out'}
                      </span>
                      <span
                        style={{
                          fontFamily: 'var(--mono), monospace',
                          fontSize: 10.5,
                          letterSpacing: '0.04em',
                          color: C.muted,
                          background: '#fff',
                          border: `1px solid ${C.line}`,
                          borderRadius: 7,
                          padding: '3px 7px',
                          flexShrink: 0,
                        }}
                      >
                        {new Date(inv.invited_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: 5, marginTop: 9, alignItems: 'center' }}>
                      {OUTCOMES.map((o) => {
                        const on = inv.outcome === o.id;
                        return (
                          <button
                            key={o.id}
                            onClick={() => onSetOutcome(inv.id, o.id)}
                            title={o.label}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              // only the chosen one spells itself out — the rest
                              // sit back as quiet dots so the row reads at a glance
                              padding: on ? '5px 10px' : '5px 8px',
                              borderRadius: 999,
                              border: `1px solid ${on ? o.color + '55' : 'transparent'}`,
                              background: on ? o.bg : 'transparent',
                              color: on ? o.color : C.muted,
                              fontSize: 12,
                              fontWeight: on ? 600 : 500,
                              opacity: on ? 1 : 0.55,
                              transition: 'background 120ms, opacity 120ms',
                            }}
                          >
                            <span style={{ fontSize: 12.5, lineHeight: 1 }}>
                              {OUTCOME_EMOJI[o.id]}
                            </span>
                            {on && o.label}
                          </button>
                        );
                      })}
                      <button
                        onClick={() => onDeleteInvite(inv.id)}
                        aria-label="Delete invite"
                        style={{
                          marginLeft: 'auto',
                          border: 'none',
                          background: 'transparent',
                          color: '#C9C7D2',
                          padding: 2,
                          display: 'flex',
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* actions */}
        {saveMsg && (
          <div style={{ fontSize: 12.5, color: '#D6336C', marginTop: 14, textAlign: 'center' }}>
            {saveMsg}
          </div>
        )}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            marginTop: 16,
            minHeight: 16,
            fontSize: 12,
            color: saveState === 'error' ? '#D6336C' : C.muted,
            opacity: saveState === 'idle' ? 0 : 1,
            transition: 'opacity 200ms',
          }}
        >
          {/* only speaks while something is happening; silent the rest of the time */}
          {saveState === 'saving' ? (
            <>
              <Loader2 size={13} className="spin" /> Saving…
            </>
          ) : saveState === 'saved' ? (
            <>
              <Check size={13} /> Saved
            </>
          ) : saveState === 'error' ? (
            'Not saved'
          ) : null}
        </div>

        {person && !confirmRemove && (
          <button
            onClick={openRemove}
            style={{
              width: '100%',
              marginTop: 8,
              padding: '12px 0',
              borderRadius: 14,
              border: `1px solid ${C.line}`,
              background: '#fff',
              color: '#D6336C',
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            Remove from deck
          </button>
        )}

        {person && confirmRemove && (
          <div
            style={{
              marginTop: 8,
              padding: 14,
              borderRadius: 14,
              border: '1px solid #F5C2D3',
              background: '#FDF5F8',
            }}
          >
            <div style={{ fontSize: 13.5, fontWeight: 600, color: '#D6336C' }}>
              Remove {person.name || 'her'}?
            </div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4, lineHeight: 1.45 }}>
              This deletes her and all {invites.length}{' '}
              {invites.length === 1 ? 'ask' : 'asks'}. It can&apos;t be undone.
            </div>

            {passRequired && (
              <input
                value={passAttempt}
                onChange={(e) => setPassAttempt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && doRemove()}
                type="password"
                inputMode="numeric"
                autoComplete="off"
                placeholder="PIN"
                style={{
                  ...inputStyle,
                  marginTop: 10,
                  background: '#fff',
                  textAlign: 'center',
                  letterSpacing: '0.3em',
                }}
              />
            )}
            {removeMsg && (
              <div style={{ fontSize: 12, color: '#D6336C', marginTop: 6 }}>{removeMsg}</div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                onClick={() => {
                  setConfirmRemove(false);
                  setPassAttempt('');
                  setRemoveMsg('');
                }}
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
                Keep her
              </button>
              <button
                onClick={doRemove}
                disabled={removing}
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
                {removing ? 'Removing…' : 'Yes, remove'}
              </button>
            </div>
          </div>
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
