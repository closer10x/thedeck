'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import Roster from '../components/Roster';
import IdleLock from '../components/IdleLock';

export default function Page() {
  const [people, setPeople] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, i] = await Promise.all([
      supabase.from('people').select('*').order('created_at', { ascending: false }),
      supabase.from('invites').select('*').order('invited_at', { ascending: false }),
    ]);
    // clear on success too, or one bad load leaves the banner up forever
    setError((p.error || i.error)?.message || null);
    setPeople(p.data || []);
    setInvites(i.data || []);
    setLoading(false);
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
          await supabase.from('people').update(update).eq('id', p.id);
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

  async function savePerson(person) {
    const row = {
      name: person.name,
      ig_handle: person.ig_handle || null,
      phone: person.phone || null,
      photos: person.photos || [],
      photos_synced_at: person.photos_synced_at || null,
      photo_url: person.photo_url || null,
      note: person.note || null,
      rat_chat: !!person.rat_chat,
      archived: !!person.archived,
    };
    // Returns { error, id }. The id matters for autosave: the first write for
    // a new person is an insert, and the caller needs her id so the next
    // keystroke updates that row instead of inserting her all over again.
    const res = person.id
      ? await supabase.from('people').update(row).eq('id', person.id).select('id').single()
      : await supabase.from('people').insert(row).select('id').single();
    await load();
    return { error: res.error?.message || null, id: res.data?.id || person.id || null };
  }

  async function removePerson(id) {
    const { error } = await supabase.from('people').delete().eq('id', id);
    await load();
    if (error) setError(error.message);
  }

  async function logInvite(personId, what, outcome = 'pending', when = new Date()) {
    const { error } = await supabase
      .from('invites')
      .insert({ person_id: personId, what: what || null, outcome, invited_at: when.toISOString() });
    await load();
    if (error) setError(error.message);
  }

  async function setOutcome(inviteId, outcome) {
    const { error } = await supabase.from('invites').update({ outcome }).eq('id', inviteId);
    await load();
    if (error) setError(error.message);
  }

  async function setInviteNote(inviteId, note) {
    const { error } = await supabase
      .from('invites')
      .update({ note: note || null })
      .eq('id', inviteId);
    await load();
    if (error) setError(error.message);
  }

  async function deleteInvite(inviteId) {
    const { error } = await supabase.from('invites').delete().eq('id', inviteId);
    await load();
    if (error) setError(error.message);
  }

  return (
    <>
      <IdleLock />
      <Roster
        people={people}
        invites={invites}
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
