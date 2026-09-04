import { supabaseAdmin } from './supabaseAdmin';
import { actorName } from './lock';

// The log is written from the same place the change is: server-side, from the
// verified cookie, never from a name the browser sent. A client that could name
// its own actor could sign someone else's name to its edits.
//
// Awaited rather than fired and forgotten — on a serverless host the function
// can be frozen the moment the response goes out, and a dropped log entry is
// invisible in a way a slow one isn't. But awaited on a budget, because an
// entry describing what happened must never be able to stop it happening.
//
// It could. With Supabase unreachable, this await was why a correct PIN came
// back as "Wrong PIN": /api/unlock had already matched the PIN and set the
// cookie, then sat here waiting on a database that takes ~20s to refuse a
// connection, until the platform killed the request — and the lock screen
// reads any non-ok response as a bad passcode. The sign-in was complete and
// the only thing left to do was write it down.
const LOG_BUDGET_MS = 2500;
const TIMED_OUT = Symbol('timed out');

// Stops waiting; doesn't cancel. The write may still land after we've stopped
// listening, which is the right way round — losing the entry costs a line in a
// feed, holding the response costs the user the app.
function onABudget(work) {
  let timer;
  return Promise.race([
    work,
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(TIMED_OUT), LOG_BUDGET_MS);
    }),
  ]).finally(() => clearTimeout(timer));
}

// One sitting's worth of edits. Autosave writes ~700ms after you stop typing,
// so changing a note reaches the server three or four times and each arrival is
// a real change to the row — but "Jon updated her note" three times in five
// seconds describes the typing, not the edit.
const COALESCE_MS = 3 * 60 * 1000;

// Has this exact edit already been recorded recently? Compared on the changed
// fields, so editing the note and then the phone still gets two entries.
async function alreadySaid(actor, entry) {
  if (!entry.person_id) return false;

  const { data } = await supabaseAdmin
    .from('activity')
    .select('meta')
    .eq('actor', actor)
    .eq('action', entry.action)
    .eq('person_id', entry.person_id)
    .gte('at', new Date(Date.now() - COALESCE_MS).toISOString())
    .order('at', { ascending: false })
    .limit(1);

  if (!data?.length) return false;
  return JSON.stringify(data[0].meta?.fields ?? null) === JSON.stringify(entry.meta?.fields ?? null);
}

// `entry.actor` is for the one case the cookie can't answer: signing in, where
// the request still carries the previous session (or none) and the name comes
// from the PIN that just matched. Everywhere else, leave it off.
//
// `entry.coalesce` marks an action that arrives in bursts — set it and a repeat
// of the same edit inside the window is dropped rather than written again. The
// entry that survives is the first, so the log timestamps when you started.
export async function logActivity(req, entry) {
  const outcome = await onABudget(write(req, entry));
  if (outcome === TIMED_OUT) {
    console.error(`[activity] not recorded: the database did not answer in ${LOG_BUDGET_MS}ms`);
  }
}

async function write(req, entry) {
  try {
    const actor = entry.actor || (await actorName(req));
    if (entry.coalesce && (await alreadySaid(actor, entry))) return;

    const { error } = await supabaseAdmin.from('activity').insert({
      actor,
      action: entry.action,
      subject: entry.subject || null,
      detail: entry.detail || null,
      person_id: entry.person_id || null,
      meta: entry.meta || null,
    });
    // A write that succeeded shouldn't fail because logging it didn't — the
    // table may simply not exist yet (see supabase/activity-log.sql). Say so in
    // the server log and let the caller's response stand.
    if (error) console.error('[activity] not recorded:', error.message);
  } catch (e) {
    console.error('[activity] not recorded:', e?.message || e);
  }
}

// How a person's fields read in the feed. Anything not named here is something
// the feed has no useful sentence for, and gets counted rather than named.
export const FIELD_LABELS = {
  name: 'name',
  ig_handle: 'Instagram',
  phone: 'phone',
  note: 'note',
  photo_url: 'photo',
  photos: 'photos',
  city: 'where she’s from',
  rat_chat: 'rat chat',
  wingman: 'wingman',
  archived: 'archived',
};

// Which of the columns we care about actually changed. Compared by value, not
// by presence: autosave sends the whole row on every keystroke, so "the client
// mentioned this field" says nothing about whether it's different.
export function changedFields(before, after, fields) {
  if (!before) return [];
  return fields.filter((f) => JSON.stringify(before[f] ?? null) !== JSON.stringify(after[f] ?? null));
}

// "name and phone", "name, phone and note" — a list that reads as a sentence.
export function andList(items) {
  if (items.length <= 1) return items[0] || '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
