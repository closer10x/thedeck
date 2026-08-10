import { supabaseAdmin } from './supabaseAdmin';
import { actorName } from './lock';

// The log is written from the same place the change is: server-side, from the
// verified cookie, never from a name the browser sent. A client that could name
// its own actor could sign someone else's name to its edits.
//
// Awaited rather than fired and forgotten — on a serverless host the function
// can be frozen the moment the response goes out, and a dropped log entry is
// invisible in a way a slow one isn't.
// `entry.actor` is for the one case the cookie can't answer: signing in, where
// the request still carries the previous session (or none) and the name comes
// from the PIN that just matched. Everywhere else, leave it off.
export async function logActivity(req, entry) {
  try {
    const { error } = await supabaseAdmin.from('activity').insert({
      actor: entry.actor || (await actorName(req)),
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
  rat_chat: 'rat chat',
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
