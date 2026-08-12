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
  History,
  ChevronRight,
  MapPin,
} from 'lucide-react';
import Avatar from './Avatar';
import Smash from './Smash';
import ActivityLog from './ActivityLog';
import { STATUSES } from './EventSheet';
import { parseHandle, formatUSPhone, OUTCOME_EMOJI } from '../lib/format';

const C = { ink: 'var(--ink)', muted: 'var(--muted)', line: 'var(--line)', accent: 'var(--accent)' };

const OUTCOMES = [
  { id: 'pending', label: 'Waiting', color: 'var(--muted-2)', bg: 'var(--tint)' },
  { id: 'yes', label: 'Yes', color: 'var(--good)', bg: 'var(--good-tint)' },
  { id: 'no', label: 'No', color: 'var(--bad)', bg: 'var(--bad-tint)' },
  { id: 'ghost', label: 'Ghosted', color: 'var(--warn)', bg: 'var(--warn-tint)' },
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
// "not_found" is the one that sends you off to double-check the handle, so the
// server only says it when something actually looked and came back empty.
function gridMessage(data) {
  if (data.posts?.length) return '';
  switch (data.status) {
    case 'rate_limited':
      return data.photo_url
        ? 'Photo saved. Instagram is rate-limiting the grid — try again in a few minutes.'
        : 'Instagram is rate-limiting right now. Try again in a few minutes.';
    case 'blocked':
      return data.photo_url
        ? "Photo saved. Instagram won't show the grid to the server — add the rest below."
        : "Instagram wouldn't answer the server. Add her photos yourself below.";
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
  onSetInviteNote,
  onDeleteInvite,
  onAxe,
  events = [],
  guests = [],
  onOpenEvent,
}) {
  const [draft, setDraft] = useState(
    person || {
      name: '',
      ig_handle: '',
      photos: [],
      phone: '',
      photo_url: '',
      note: '',
      city: '',
      lat: null,
      lng: null,
      rat_chat: false,
      axed: false,
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
  // the server strips `axed` and says so when the column isn't there yet
  const [axeMissing, setAxeMissing] = useState(false);
  const [places, setPlaces] = useState([]);
  const [placesMsg, setPlacesMsg] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [passRequired, setPassRequired] = useState(false);
  const [passAttempt, setPassAttempt] = useState('');
  const [removeMsg, setRemoveMsg] = useState('');
  const [removing, setRemoving] = useState(false);
  const [showLog, setShowLog] = useState(false);
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
  const sheetRef = useRef(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const requestClose = useCallback(() => {
    setClosing(true);
    // An edit still inside the debounce dies with the unmount, so write it now.
    // The sheet slides out either way; the save rides along behind it.
    flushPending();
    setTimeout(onClose, 260); // let it finish sliding before it unmounts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  // Touch anywhere in the sheet and pull down. The drag only engages once the
  // content is scrolled to the top and you've actually moved a few pixels, so
  // tapping a field still focuses it and scrolling a long sheet still scrolls.
  function onGrabStart(e) {
    dragStart.current = { y: e.clientY, t: Date.now(), engaged: false };
  }

  function onGrabMove(e) {
    const start = dragStart.current;
    if (!start) return;
    const dy = e.clientY - start.y;

    if (!start.engaged) {
      if ((sheetRef.current?.scrollTop ?? 0) > 0) return; // still scrolling content
      if (dy <= 6) return; // a tap, or the start of an upward scroll
      start.engaged = true;
      start.y = e.clientY; // measure from where the pull really began
      setDragging(true);
      return;
    }
    setDragY(Math.max(0, e.clientY - start.y));
  }

  function onGrabEnd() {
    const start = dragStart.current;
    dragStart.current = null;
    if (!start?.engaged) return;

    const elapsed = Date.now() - start.t;
    const velocity = dragY / Math.max(elapsed, 1); // px per ms
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
  const saving = useRef(false);
  const queued = useRef(false);
  const saveTimer = useRef(null);

  // flush() reads the newest draft rather than the one captured when the timer
  // was set, so a save that waited behind another isn't stale
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // onSave is redefined on every render of the page above, and person arrives
  // as a fresh object after each refresh. Read both through refs so neither
  // identity change can land in the debounce effect's dependencies below.
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const personIdRef = useRef(person?.id);
  personIdRef.current = person?.id;

  // the sheet can unmount mid-write; the fetch still completes, but its state
  // updates have nowhere to go. Set on the way in as well as out: StrictMode
  // mounts, unmounts and remounts, and a one-way flag would stay false.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Saves run one at a time. Two in flight at once would both see a null id and
  // both insert — that's how one person becomes five rows.
  async function flush() {
    if (saving.current) {
      queued.current = true;
      return {};
    }
    saving.current = true;
    if (alive.current) setSaveState('saving');

    const res =
      (await onSaveRef.current({
        ...draftRef.current,
        id: personIdRef.current || createdId.current,
      })) || {};
    if (res.id) createdId.current = res.id;

    saving.current = false;
    if (alive.current) {
      if (!res.error) setAxeMissing(res.axe === 'missing');
      setSaveState(res.error ? 'error' : 'saved');
      setSaveMsg(res.error ? `Could not save: ${res.error}` : '');
      if (!res.error) setTimeout(() => setSaveState('idle'), 1400);
    }

    if (queued.current) {
      queued.current = false;
      flush(); // whatever changed while that one was in flight
    }
    return res;
  }

  // Writes whatever is still sitting in the debounce. Called on close, where
  // the alternative is dropping the edit on the floor.
  function flushPending() {
    clearTimeout(saveTimer.current);
    if (!(draftRef.current?.name || '').trim()) return;
    const body = JSON.stringify(draftRef.current);
    if (body === savedSnapshot.current) return;
    savedSnapshot.current = body;
    flush();
  }

  // Deps are the draft alone. Anything else here — onSave, person.id — changes
  // identity on every refresh from the page above, and since the cleanup
  // cancels the pending timer, a refresh mid-edit would restart the 700ms wait
  // instead of letting it fire. Under a burst of refreshes it never fires.
  useEffect(() => {
    if (!(draft.name || '').trim()) return; // nothing to create her by yet
    const body = JSON.stringify(draft);
    if (body === savedSnapshot.current) return;

    saveTimer.current = setTimeout(() => {
      savedSnapshot.current = body;
      flush();
    }, 700);
    return () => clearTimeout(saveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  // The swing plays here the moment you flip it, on the face at the top of the
  // sheet. The row underneath is covered by the sheet, so it's told separately
  // to play its own once you've closed it — otherwise the smash you asked for
  // happens where you can't see it.
  function toggleAxe() {
    const next = !draft.axed;
    set('axed', next);
    if (next && person?.id) onAxe?.(person.id);
  }

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

  // Autosave covers existing people, but adding someone new needs a finish
  // line — an empty sheet with a silent status line reads as broken.
  async function addNow() {
    if (!(draft.name || '').trim()) {
      setSaveMsg('She needs a name first.');
      return;
    }
    setSaveMsg('');
    savedSnapshot.current = JSON.stringify(draft);
    const res = await flush(); // same serialized path, so it can't race the debounce
    if (!res.error) requestClose();
  }

  // --- where she's from ----------------------------------------------------
  // Typing suggests, picking geocodes. Only the pick costs a Google lookup, and
  // only the pick is trusted to place her: free text stays as text, and she
  // simply doesn't appear on the map until a real place has been chosen.
  const [cities, setCities] = useState([]);
  const [cityMsg, setCityMsg] = useState('');
  const [locating, setLocating] = useState(false);
  const citySeq = useRef(0);
  const cityTimer = useRef(null);

  function onCityChange(v) {
    set('city', v);
    // editing the text un-pins her: the old coordinates belong to the old place
    if (draft.lat != null) {
      set('lat', null);
      set('lng', null);
    }
    setCityMsg('');

    const seq = ++citySeq.current;
    clearTimeout(cityTimer.current);
    cityTimer.current = setTimeout(async () => {
      if (v.trim().length < 3) return setCities([]);
      try {
        const r = await fetch(`/api/places?q=${encodeURIComponent(v)}`);
        const out = await r.json();
        if (seq === citySeq.current) setCities(out.suggestions || []);
      } catch {
        setCities([]);
      }
    }, 300);
  }

  async function pickCity(c) {
    setCities([]);
    set('city', c.main);
    setLocating(true);
    setCityMsg('');
    try {
      // the secondary line is the country/region — it disambiguates the
      // Tampas of this world, so geocode with it rather than the name alone
      const q = [c.main, c.secondary].filter(Boolean).join(', ');
      const out = await (await fetch(`/api/geocode?q=${encodeURIComponent(q)}`)).json();
      if (out.lat != null) {
        set('lat', out.lat);
        set('lng', out.lng);
      } else {
        setCityMsg(
          out.error === 'upstream'
            ? "Google wouldn't place that — the key may not have Places enabled."
            : "Couldn't find that on the map. The name is saved anyway."
        );
      }
    } catch {
      setCityMsg("Couldn't reach the server. The name is saved anyway.");
    }
    setLocating(false);
  }

  useEffect(() => () => clearTimeout(cityTimer.current), []);

  // The pill does two jobs off one target, so the single tap has to wait long
  // enough to find out whether a second one is coming. Browsers keep the user's
  // activation alive for seconds after a click, so opening the tab this late is
  // still not treated as a popup — and if one blocks it anyway, go there in
  // place rather than doing nothing.
  const igTap = useRef(null);

  function openIg() {
    if (igTap.current) return; // this is the second tap; editIg will take it
    igTap.current = setTimeout(() => {
      igTap.current = null;
      const url = `https://instagram.com/${draft.ig_handle}`;
      if (!window.open(url, '_blank', 'noopener,noreferrer')) window.location.href = url;
    }, 260);
  }

  function editIg() {
    clearTimeout(igTap.current);
    igTap.current = null;
    setIgOpen(true);
  }

  // tapping and immediately swiping the sheet away shouldn't open a tab behind it
  useEffect(() => () => clearTimeout(igTap.current), []);

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
        // so the log can say whose photo it was. The id is what counts; the
        // name is only read when she hasn't been saved yet and has no id.
        body.append('person_id', person?.id || '');
        body.append('name', draft.name || '');
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
      body.append('person_id', person?.id || '');
      body.append('name', draft.name || '');
      body.append('kind', 'avatar');
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
      const pulled = (data.posts || []).map((p) => ({ ...p, source: 'ig' }));
      const got = pulled.length || data.photo_url;

      // One update built from the live draft, not the one captured when this
      // request started — a pull takes seconds, and anything typed meanwhile
      // would otherwise be written back over.
      setDraft((d) => {
        // her grid replaces whatever was pulled before, but never the shots
        // uploaded by hand. no posts means throttled or locked, not "she
        // deleted everything", so keep what's already there.
        const kept = (d.photos || []).filter((p) => p.source !== 'ig');
        return {
          ...d,
          ig_handle: handle,
          // fill the name only if it's still blank — never overwrite yours
          name: (d.name || '').trim() ? d.name : data.name || d.name || '',
          photos: pulled.length ? [...kept, ...pulled].slice(0, 6) : d.photos || [],
          photo_url: data.photo_url || d.photo_url || '',
          photos_synced_at: got ? new Date().toISOString() : d.photos_synced_at || null,
        };
      });

      if (data.photo_url) setIgOpen(false);
      // the avatar and the grid come from different places, so say which half
      // fell over rather than leaving an empty grid with no explanation
      setPhotoMsg(gridMessage(data));

      // A pull is real work — persist it now instead of waiting out the
      // debounce. Goes through the same serialized path as every other write,
      // so it can't race autosave into inserting her twice. Deferred a tick so
      // the draft above has committed and flushPending reads the new values.
      if (got) setTimeout(flushPending, 0);
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

  // every event she's on, soonest first, with what she is on each
  const herEvents = (guests || [])
    .filter((g) => g.person_id === person?.id)
    .map((guest) => ({
      guest,
      event: events.find((e) => e.id === guest.event_id),
      status: STATUSES.find((s) => s.id === guest.status),
    }))
    .filter((x) => x.event)
    .sort((a, b) => (a.event.at ? new Date(a.event.at) : Infinity) - (b.event.at ? new Date(b.event.at) : Infinity));

  return (
    <>
    <div
      onClick={requestClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: `rgba(22,21,28,${0.32 * backdropFade})`,
        // the roster blurs out behind the sheet, and un-blurs as you drag it
        // down — so the dismiss gesture is felt in the background too
        backdropFilter: `blur(${8 * backdropFade}px)`,
        WebkitBackdropFilter: `blur(${8 * backdropFade}px)`,
        transition: dragging ? 'none' : 'background 260ms ease, backdrop-filter 260ms ease',
        zIndex: 20,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        ref={sheetRef}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={onGrabStart}
        onPointerMove={onGrabMove}
        onPointerUp={onGrabEnd}
        onPointerCancel={onGrabEnd}
        style={{
          width: '100%',
          maxWidth: 480,
          maxHeight: '92dvh',
          overflowY: 'auto',
          overflowX: 'hidden', // nothing in here should ever scroll sideways
          overscrollBehavior: 'contain',
          // pan-y so the sheet still scrolls; we only take over at the top
          touchAction: 'pan-y',
          background: 'var(--surface)',
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
        {/* the whole top block drags — grabber and the name row with it, so
            there's a thumb-sized target instead of a 4px bar */}
        <div
          onPointerDown={onGrabStart}
          onPointerMove={onGrabMove}
          onPointerUp={onGrabEnd}
          onPointerCancel={onGrabEnd}
          style={{ cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none' }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 12px' }}>
            <div
              style={{
                width: dragging ? 46 : 38,
                height: 4,
                borderRadius: 2,
                background: dragging ? 'var(--grabber)' : 'var(--line)',
                transition: 'background 150ms, width 150ms',
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
            {/* the camera badge is positioned against the button, not the
                avatar, so the ring appears inside without moving it */}
            <Smash axed={draft.axed} src={draft.photo_url} size={62}>
              <Avatar
                name={draft.name}
                url={draft.photo_url}
                size={62}
                ring={!!draft.ig_handle}
              />
            </Smash>
            <span
              style={{
                position: 'absolute',
                right: -2,
                bottom: -2,
                width: 23,
                height: 23,
                borderRadius: '50%',
                background: 'var(--surface)',
                border: `1px solid ${C.line}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 1px 4px var(--shadow)',
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
              // inputs carry an intrinsic min-width; without this the field
              // refuses to shrink and shoves the close button off the edge
              minWidth: 0,
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
                color: 'var(--bad)',
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
          // Collapsed, the pill is a link first: the thing you actually want
          // from a handle is to go and look at it. Editing is the rarer job and
          // hides behind a second tap.
          <button
            onClick={openIg}
            onDoubleClick={editIg}
            title={`Open @${draft.ig_handle} — double-tap to edit`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '7px 11px 7px 8px',
              borderRadius: 999,
              border: `1px solid ${C.line}`,
              background: 'var(--field)',
              color: C.ink,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <Instagram size={15} color={C.accent} />@{draft.ig_handle}
            {/* she's on the weekly re-pull — photos and avatar refresh on their own */}
            <span
              title="Refreshing from Instagram weekly"
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--good)',
                boxShadow: '0 0 0 2.5px rgba(18,128,92,0.16)',
                flexShrink: 0,
                marginLeft: 1,
              }}
            />
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
              background: 'var(--accent-tint)',
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
          <div style={{ fontSize: 12, color: 'var(--warn-text)', marginTop: 6 }}>{photoMsg}</div>
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
                      background: 'var(--tint)',
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
                    color: 'var(--surface)',
                  }}
                >
                  <X size={12} strokeWidth={2.6} />
                </button>
              </div>
            );
          })}

          {photos.length > 0 && photos.length < 6 && (
            <button
              onClick={() => gridRef.current?.click()}
              disabled={addingPhotos}
              style={{
                position: 'relative',
                aspectRatio: '1 / 1',
                padding: 0,
                border: `1.5px dashed #D8D6E2`,
                borderRadius: 9,
                background: 'var(--field)',
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
                  Add
                </>
              )}
            </button>
          )}
        </div>

        {/* nothing yet: one lonely square looked like a bug, so the empty state
            is a full-width dropzone instead */}
        {photos.length === 0 && (
          <button
            onClick={() => gridRef.current?.click()}
            disabled={addingPhotos}
            style={{
              width: '100%',
              marginTop: 10,
              padding: '18px 0',
              border: `1.5px dashed #D8D6E2`,
              borderRadius: 12,
              background: 'var(--field)',
              color: C.muted,
              fontSize: 12.5,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
            }}
          >
            {addingPhotos ? (
              <>
                <Loader2 size={15} className="spin" /> Uploading…
              </>
            ) : (
              <>
                <Plus size={15} /> Add photos
              </>
            )}
          </button>
        )}
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
            { v: true, label: 'Yes', color: 'var(--good)', bg: 'var(--good-tint)' },
            { v: false, label: 'No', color: 'var(--muted-2)', bg: 'var(--tint)' },
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
                  background: on ? o.bg : 'var(--surface)',
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

        {/* The axe. No sentence explaining itself: an axe and a switch, and
            what it does is obvious the first time you flip it and watch. */}
        <Label>Axe</Label>
        <button
          role="switch"
          aria-checked={!!draft.axed}
          aria-label="Axe her photo"
          onClick={toggleAxe}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            padding: '9px 12px',
            borderRadius: 12,
            border: `1px solid ${C.line}`,
            // the same field every other row sits in, on or off: the switch is
            // already saying which it is, and a panel that changes colour
            // underneath it says it twice and louder
            background: 'var(--field)',
          }}
        >
          {/* dimmed until it's on, so the row reads as "off" at a glance
              without a word saying so */}
          {/* the same 🪓 that marks her row, at the size the sheet's other
              rows set their text — dimmed until it's on, so the row reads as
              a state at a glance without a word saying so */}
          <span
            style={{
              fontSize: 22,
              lineHeight: 1.2,
              opacity: draft.axed ? 1 : 0.4,
              filter: draft.axed ? 'none' : 'grayscale(1)',
              transition: 'opacity 160ms, filter 160ms',
            }}
          >
            {'\uD83E\uDE93'}
          </span>
          {/* the switch is drawn rather than an <input>: the whole row is the
              target, and a checkbox inside a button is a button inside a button */}
          <span
            style={{
              position: 'relative',
              width: 46,
              height: 27,
              flexShrink: 0,
              borderRadius: 999,
              background: draft.axed ? 'var(--bad)' : 'var(--dot)',
              transition: 'background 160ms',
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: 3,
                left: draft.axed ? 22 : 3,
                width: 21,
                height: 21,
                borderRadius: '50%',
                background: '#FFFFFF',
                boxShadow: '0 1px 3px var(--shadow-lift)',
                transition: 'left 160ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            />
          </span>
        </button>
        {axeMissing && (
          <div style={{ fontSize: 12, color: 'var(--warn-text)', marginTop: 7 }}>
            The rest of her saved, but the axe didn&apos;t — run{' '}
            <code style={{ fontFamily: 'var(--mono), monospace', fontSize: 11.5 }}>
              supabase/axe.sql
            </code>{' '}
            once in the SQL editor and it&apos;ll stick.
          </div>
        )}

        {/* where she's from — the map's whole input */}
        <Label>From</Label>
        <div style={{ position: 'relative' }}>
          <MapPin
            size={15}
            color={draft.lat != null ? C.accent : C.muted}
            style={{ position: 'absolute', left: 12, top: 13, pointerEvents: 'none' }}
          />
          <input
            value={draft.city || ''}
            onChange={(e) => onCityChange(e.target.value)}
            onBlur={() => setTimeout(() => setCities([]), 150)}
            placeholder="Her city — Tampa, Palm Beach…"
            style={{ ...inputStyle, paddingLeft: 34, paddingRight: 34 }}
          />
          {locating && (
            <Loader2
              size={14}
              color={C.muted}
              className="spin"
              style={{ position: 'absolute', right: 12, top: 13 }}
            />
          )}
          {/* a pin only appears once Google has actually placed her */}
          {!locating && draft.lat != null && (
            <Check size={15} color="var(--good)" style={{ position: 'absolute', right: 12, top: 13 }} />
          )}

          {cities.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                zIndex: 3,
                marginTop: 4,
                background: 'var(--surface)',
                border: `1px solid ${C.line}`,
                borderRadius: 12,
                boxShadow: '0 12px 30px var(--shadow-lift)',
                overflow: 'hidden',
              }}
            >
              {cities.map((c, i) => (
                <button
                  key={i}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickCity(c)}
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
                  <div style={{ color: C.ink }}>{c.main}</div>
                  {c.secondary && (
                    <div style={{ fontSize: 11.5, color: C.muted }}>{c.secondary}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 5 }}>
          {cityMsg ||
            (draft.lat != null
              ? 'Pinned on the map.'
              : 'Pick a suggestion to put her on the map.')}
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
            <div
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <Label>Invites</Label>
              {/* everything anyone has ever done to her, not just the asks */}
              <button
                onClick={() => setShowLog(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  border: 'none',
                  background: 'transparent',
                  padding: '0 0 6px',
                  color: C.muted,
                  fontSize: 12,
                }}
              >
                <History size={13} /> History
              </button>
            </div>
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
                      background: 'var(--surface)',
                      border: `1px solid ${C.line}`,
                      borderRadius: 11,
                      overflow: 'hidden',
                      boxShadow: '0 8px 24px var(--shadow)',
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
                          background: 'var(--surface)',
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
                  background: showDate ? 'var(--accent-tint)' : 'var(--field)',
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
                  color: 'var(--surface)',
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
                onChange={(e) => setWhen(e.target.value)}
                style={{ ...inputStyle, marginTop: 8 }}
              />
            )}
            {placesMsg && (
              <div style={{ fontSize: 11.5, color: 'var(--warn-text)', marginTop: 6 }}>{placesMsg}</div>
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
                      background: 'var(--sunken)',
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
                          background: 'var(--surface)',
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

                    {/* older asks predate the log and have nobody on them —
                        better blank than guessing it was whoever's looking */}
                    {inv.created_by && (
                      <div
                        style={{
                          fontFamily: 'var(--mono), monospace',
                          fontSize: 10,
                          letterSpacing: '0.04em',
                          color: C.muted,
                          marginTop: 5,
                        }}
                      >
                        Logged by {inv.created_by}
                      </div>
                    )}

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
                          color: 'var(--faint)',
                          padding: 2,
                          display: 'flex',
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    {/* a "no" is worth a reason. stays visible for any outcome
                        once written, so changing your mind doesn't hide it */}
                    {(inv.outcome === 'no' || inv.note) && (
                      <input
                        defaultValue={inv.note || ''}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== (inv.note || '')) onSetInviteNote(inv.id, v);
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                        placeholder="Why not? (busy, not interested, bad timing…)"
                        style={{
                          width: '100%',
                          marginTop: 9,
                          padding: '8px 10px',
                          borderRadius: 9,
                          border: `1px solid ${C.line}`,
                          background: 'var(--surface)',
                          fontSize: 12.5,
                          color: C.ink,
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* actions */}
        {!person && (
          <button
            onClick={addNow}
            disabled={saveState === 'saving'}
            style={{
              width: '100%',
              marginTop: 20,
              padding: '14px 0',
              borderRadius: 14,
              border: 'none',
              background: (draft.name || '').trim() ? C.accent : 'var(--line)',
              color: (draft.name || '').trim() ? 'var(--surface)' : 'var(--muted)',
              fontSize: 15,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              transition: 'background 160ms, color 160ms',
            }}
          >
            {saveState === 'saving' ? (
              <>
                <Loader2 size={16} className="spin" /> Adding…
              </>
            ) : (
              <>
                <Plus size={17} /> Add to deck
              </>
            )}
          </button>
        )}

        {saveMsg && (
          <div style={{ fontSize: 12.5, color: 'var(--bad)', marginTop: 14, textAlign: 'center' }}>
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
            color: saveState === 'error' ? 'var(--bad)' : C.muted,
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

        {/* What the asks turned into. Read-only here — you put people on an
            event from the event itself, where you can see who else is going. */}
        {person && herEvents.length > 0 && (
          <>
            <Label>On the calendar</Label>
            {herEvents.map(({ guest, event: ev, status }) => (
              <button
                key={guest.id}
                onClick={() => onOpenEvent?.(ev.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  width: '100%',
                  textAlign: 'left',
                  background: 'var(--sunken)',
                  border: `1px solid ${C.line}`,
                  borderRadius: 13,
                  padding: '10px 12px',
                  marginBottom: 7,
                }}
              >
                <span style={{ fontSize: 14, lineHeight: 1 }}>{status?.emoji || '🎟️'}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 13.5,
                      fontWeight: 550,
                      color: C.ink,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {ev.name}
                  </span>
                  <span style={{ fontFamily: 'var(--mono), monospace', fontSize: 10.5, color: C.muted }}>
                    {ev.at
                      ? new Date(ev.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                      : 'Someday'}
                    {status ? ` · ${status.label}` : ''}
                  </span>
                </span>
                <ChevronRight size={15} color="#C9C7D2" />
              </button>
            ))}
          </>
        )}

        {/* who put her on the deck. Blank for anyone added before the log
            existed, which is honest — nobody knows who that was. */}
        {person?.created_by && (
          <div
            style={{
              fontFamily: 'var(--mono), monospace',
              fontSize: 10,
              letterSpacing: '0.04em',
              color: C.muted,
              textAlign: 'center',
              marginTop: 14,
            }}
          >
            Added by {person.created_by}
          </div>
        )}

        {person && !confirmRemove && (
          <button
            onClick={openRemove}
            style={{
              width: '100%',
              marginTop: 8,
              padding: '12px 0',
              borderRadius: 14,
              border: `1px solid ${C.line}`,
              background: 'var(--surface)',
              color: 'var(--bad)',
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
              background: 'var(--bad-panel)',
            }}
          >
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--bad)' }}>
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
                  background: 'var(--surface)',
                  textAlign: 'center',
                  letterSpacing: '0.3em',
                }}
              />
            )}
            {removeMsg && (
              <div style={{ fontSize: 12, color: 'var(--bad)', marginTop: 6 }}>{removeMsg}</div>
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
                  background: 'var(--surface)',
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
                  background: 'var(--bad)',
                  color: 'var(--surface)',
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

    {/* her history, not the whole deck's — sits above the sheet rather than
        inside it, so closing the log doesn't close her */}
    {showLog && person && (
      <ActivityLog
        personId={person.id}
        title={person.name}
        onClose={() => setShowLog(false)}
      />
    )}
    </>
  );
}

const inputStyle = {
  width: '100%',
  padding: '11px 12px',
  borderRadius: 11,
  border: '1px solid #E9E8EF',
  background: 'var(--field)',
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
        color: 'var(--label)',
        margin: '20px 0 8px',
      }}
    >
      {children}
    </div>
  );
}
