'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Roster from '../components/Roster';
import IdleLock from '../components/IdleLock';

// Every call goes to our own server, never to Supabase. RLS is on with no
// policies, so the tables are unreachable except through the service role —
// which lives server-side, behind the PIN gate in middleware.js.
async function api(path, options) {
  let r;
  try {
    r = await fetch(path, options);
  } catch (e) {
    // fetch rejects rather than resolving when the connection drops — a dev
    // server restarting, a tab waking on a dead network. Returning the failure
    // instead of throwing keeps every caller's await settling; an unhandled
    // rejection here used to strand the roster on "Loading the deck…" forever.
    return { error: e?.message || 'Could not reach the server.' };
  }
  const out = await r.json().catch(() => ({}));
  if (!r.ok) return { error: out.error || `Request failed (${r.status})` };
  return out;
}

export default function Page() {
  const [people, setPeople] = useState([]);
  const [invites, setInvites] = useState([]);
  // who's signed in — the roster load answers it, from the session cookie
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Only the first load draws the spinner. Every later refresh is silent —
  // flipping `loading` on a background refresh replaces the roster with
  // "Loading the deck…" mid-edit, and costs a render the sheet has to survive.
  const loadedOnce = useRef(false);
  const load = useCallback(async () => {
    if (!loadedOnce.current) setLoading(true);
    try {
      const out = await api('/api/data');
      // clear on success too, or one bad load leaves the banner up forever
      setError(out.error || null);
      setPeople(out.people || []);
      setInvites(out.invites || []);
      // a failed load shouldn't blank the name out of the header
      if (out.me) setMe(out.me);
    } finally {
      // whatever went wrong, stop showing the spinner. A stuck `loading` looks
      // exactly like a hung app and hides the error that would explain it.
      loadedOnce.current = true;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Instagram grids go stale — new posts, new profile pic. Re-pull anyone whose
  // last sync is over a week old, quietly, after the list is already on screen.
  // Two per session and one at a time: Instagram throttles hard by IP, and a
  // burst here would poison the pulls you actually asked for.
  const refreshed = useRef(false);
  useEffect(() => {
    if (loading || refreshed.current || !people.length) return;
    refreshed.current = true;

    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const stale = people
      .filter((p) => p.ig_handle && !p.archived)
      .filter((p) => !p.photos_synced_at || new Date(p.photos_synced_at).getTime() < weekAgo)
      .slice(0, 2);
    if (!stale.length) return;

    let cancelled = false;
    (async () => {
      for (const p of stale) {
        if (cancelled) return;
        try {
          const r = await fetch('/api/ig', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ input: p.ig_handle }),
          });
          const data = await r.json();
          const update = {};

          // Only overwrite the grid when Instagram actually handed one over.
          // Being throttled returns zero posts, and writing that through would
          // erase photos she already has.
          if (data.posts?.length) {
            const keptUploads = (p.photos || []).filter((x) => x.source !== 'ig');
            const pulled = data.posts.map((x) => ({ ...x, source: 'ig' }));
            update.photos = [...keptUploads, ...pulled].slice(0, 6);
          }
          if (data.photo_url) update.photo_url = data.photo_url;

          // a real answer — grid, locked account, or gone — counts as synced.
          // being throttled doesn't, so she stays due and gets picked up again.
          if (['ok', 'private', 'not_found'].includes(data.status)) {
            update.photos_synced_at = new Date().toISOString();
          }

          if (!Object.keys(update).length) continue;
          // send the whole row back — the endpoint replaces, it doesn't merge
          await api('/api/people', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ...p, ...update }),
          });
        } catch {
          /* next week */
        }
      }
      if (!cancelled) await load();
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, people, load]);

  const json = (body) => ({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  // These are all wrapped so their identities survive a refresh. The sheet
  // debounces autosave on a timer that its effect cancels whenever a prop
  // changes, so a handler rebuilt on every render kept resetting the wait and
  // edits never reached the server.

  // Returns { error, id }. The id matters for autosave: the first write for a
  // new person is an insert, and the caller needs her id so the next keystroke
  // updates that row instead of inserting her all over again.
  const savePerson = useCallback(
    async (person) => {
      const out = await api('/api/people', json(person));
      await load();
      return { error: out.error || null, id: out.id || person.id || null };
    },
    [load]
  );

  const removePerson = useCallback(
    async (id) => {
      const out = await api(`/api/people?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      await load();
      if (out.error) setError(out.error);
    },
    [load]
  );

  const logInvite = useCallback(
    async (personId, what, outcome = 'pending', when = new Date()) => {
      const out = await api(
        '/api/invites',
        json({ person_id: personId, what, outcome, invited_at: when.toISOString() })
      );
      await load();
      if (out.error) setError(out.error);
    },
    [load]
  );

  const patchInvite = useCallback(
    async (body) => {
      const out = await api('/api/invites', { ...json(body), method: 'PATCH' });
      await load();
      if (out.error) setError(out.error);
    },
    [load]
  );

  const setOutcome = useCallback((id, outcome) => patchInvite({ id, outcome }), [patchInvite]);
  const setInviteNote = useCallback((id, note) => patchInvite({ id, note }), [patchInvite]);

  const deleteInvite = useCallback(
    async (inviteId) => {
      const out = await api(`/api/invites?id=${encodeURIComponent(inviteId)}`, { method: 'DELETE' });
      await load();
      if (out.error) setError(out.error);
    },
    [load]
  );

  return (
    <>
      <IdleLock />
      <Roster
        people={people}
        invites={invites}
        me={me}
        loading={loading}
        error={error}
        onSavePerson={savePerson}
        onRemovePerson={removePerson}
        onLogInvite={logInvite}
        onSetOutcome={setOutcome}
        onSetInviteNote={setInviteNote}
        onDeleteInvite={deleteInvite}
      />
    </>
  );
}
