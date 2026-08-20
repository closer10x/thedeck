import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { actorName } from '../../../lib/lock';
import { logActivity, changedFields, andList, FIELD_LABELS } from '../../../lib/audit';

export const runtime = 'nodejs';

const NO_STORE = { 'cache-control': 'no-store, max-age=0' };

// What the feed has a sentence for. Photos are deliberately absent: an upload
// is logged by /api/upload where it happens, and the weekly Instagram re-pull
// writes photos on its own, so diffing them here would fill the log with
// "updated photos" nobody did.
const LOGGED = ['name', 'ig_handle', 'phone', 'note', 'rat_chat', 'wingman', 'city'];

// Coordinates are Google's answer for whatever city was typed, not something
// anyone enters by hand — so they're stored, but never diffed for the log.
// "Jon updated her latitude" describes the geocoder, not Jon.
function coord(v) {
  // Number(null) is 0, not NaN — so a row saved with no location would land at
  // 0,0, which is a real spot in the Atlantic and would put half the deck on a
  // pin in the Gulf of Guinea. Absent has to be checked before converting.
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  // 0,0 is only ever this bug, never an answer Google gave
  if (!Number.isFinite(n)) return null;
  return n;
}

// Only these ever reach the database. Whatever else the client sends is
// dropped, so a stray field can't become a column write — created_by included,
// which is set from the session cookie and never from the request body.
function sanitize(body) {
  return {
    name: String(body.name || '').trim(),
    ig_handle: body.ig_handle || null,
    phone: body.phone || null,
    photos: Array.isArray(body.photos) ? body.photos.slice(0, 6) : [],
    photos_synced_at: body.photos_synced_at || null,
    photo_url: body.photo_url || null,
    note: body.note || null,
    city: body.city || null,
    // both or neither: half a coordinate is not a place
    ...(() => {
      const lat = coord(body.lat);
      const lng = coord(body.lng);
      const paired = lat !== null && lng !== null;
      return { lat: paired ? lat : null, lng: paired ? lng : null };
    })(),
    rat_chat: !!body.rat_chat,
    axed: !!body.axed,
    // a wingman is on the roster but not in the numbers — see Roster.js
    wingman: !!body.wingman,
    archived: !!body.archived,
  };
}

// Columns that arrived after the table did, each with the file that adds it.
// A database that hasn't had one run against it yet rejects the whole write for
// a column it's never heard of — so one unrun migration silently breaks every
// save in the app, and it surfaces as her name, her note and her photo refusing
// to stick for reasons nobody can see. A write that trips on one of these drops
// it and goes again, so the app works either side of the migration.
const LATE_COLUMNS = [
  { field: 'axed', file: 'supabase/axe.sql' },
  { field: 'wingman', file: 'supabase/wingman.sql' },
];

// PGRST204 is PostgREST's "no such column in the schema cache"; 42703 is
// Postgres saying the same thing. It still has to name one of ours — a
// different missing column is a real fault and belongs in the response.
function lateColumn(error) {
  const said = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`;
  if (!/(column|schema cache)/i.test(said)) return null;
  return LATE_COLUMNS.find((c) => new RegExp(`\\b${c.field}\\b`, 'i').test(said)) || null;
}

// Runs the write, shedding late columns one at a time for as long as the
// database keeps refusing them, and hands back the row as it actually landed
// plus which fields never made it — the log has to describe what was written,
// not what we hoped to send.
async function writeRow(run, row) {
  let attempt = row;
  const dropped = new Set();
  // at most one pass per late column, then whatever comes back is the answer
  for (let i = 0; i <= LATE_COLUMNS.length; i++) {
    const res = await run(attempt);
    const late = res.error ? lateColumn(res.error) : null;
    if (!late || dropped.has(late.field)) return { res, row: attempt, dropped };
    dropped.add(late.field);
    console.warn(`[people] no ${late.field} column — run ${late.file} to keep it`);
    const { [late.field]: _drop, ...rest } = attempt;
    attempt = rest;
  }
  return { res: await run(attempt), row: attempt, dropped };
}

// insert when there's no id, update when there is. Returns the id either way so
// autosave can switch from creating to updating after the first write.
export async function POST(req) {
  const body = await req.json();
  const row = sanitize(body);

  if (!row.name) {
    return NextResponse.json({ error: 'She needs a name.' }, { status: 400, headers: NO_STORE });
  }

  if (!body.id) {
    const { res, dropped } = await writeRow(
      (r) => supabaseAdmin.from('people').insert(r).select('id').single(),
      { ...row, created_by: await actorName(req) }
    );

    if (res.error) {
      return NextResponse.json({ error: res.error.message }, { status: 500, headers: NO_STORE });
    }
    await logActivity(req, {
      action: 'person.add',
      subject: row.name,
      person_id: res.data.id,
      detail: `Added ${row.name}`,
    });
    return NextResponse.json(
      { id: res.data.id, ...(dropped.has('axed') && { axe: 'missing' }) },
      { headers: NO_STORE }
    );
  }

  // Read first, so the log can say what changed rather than that something did.
  // Autosave posts the whole row on a debounce, and most of those posts differ
  // from the stored row in nothing at all.
  const { data: before } = await supabaseAdmin
    .from('people')
    .select('*')
    .eq('id', body.id)
    .maybeSingle();

  const { res, row: written, dropped } = await writeRow(
    (r) => supabaseAdmin.from('people').update(r).eq('id', body.id).select('id').single(),
    row
  );
  if (res.error) {
    return NextResponse.json({ error: res.error.message }, { status: 500, headers: NO_STORE });
  }

  if (before) {
    // archiving is its own thing, not one field among several
    if (!before.archived !== !written.archived) {
      await logActivity(req, {
        action: written.archived ? 'person.archive' : 'person.unarchive',
        subject: written.name,
        person_id: body.id,
        detail: written.archived ? `Archived ${written.name}` : `Brought ${written.name} back`,
      });
    }

    // The axe is a thing done to her, not a field she has — "Jon updated her
    // axe" would be a poor description of taking one to her face.
    if (!dropped.has('axed') && !before.axed !== !written.axed) {
      await logActivity(req, {
        action: written.axed ? 'person.axe' : 'person.unaxe',
        subject: written.name,
        person_id: body.id,
        detail: written.axed
          ? `Took the axe to ${written.name}'s photo`
          : `Pulled the axe out of ${written.name}'s photo`,
      });
    }

    const changed = changedFields(before, written, LOGGED);
    if (changed.length) {
      // a rename should read as one, and say what it was
      const renamed = changed.includes('name');
      const labels = changed.map((f) => FIELD_LABELS[f] || f);
      await logActivity(req, {
        action: 'person.update',
        subject: written.name,
        person_id: body.id,
        detail: renamed
          ? `Renamed ${before.name} to ${written.name}${
              changed.length > 1 ? `, and changed her ${andList(labels.filter((l) => l !== 'name'))}` : ''
            }`
          : `Updated ${written.name}'s ${andList(labels)}`,
        meta: { fields: changed },
        // autosave lands several times while you're typing; one entry per sitting
        coalesce: true,
      });
    }
  }

  return NextResponse.json(
    { id: res.data.id, ...(dropped.has('axed') && { axe: 'missing' }) },
    { headers: NO_STORE }
  );
}

export async function DELETE(req) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'No id.' }, { status: 400, headers: NO_STORE });

  // Her name and her tally have to be read before the row goes, or the entry
  // recording the deletion has nothing to name.
  const [{ data: person }, { count }] = await Promise.all([
    supabaseAdmin.from('people').select('name').eq('id', id).maybeSingle(),
    supabaseAdmin.from('invites').select('id', { count: 'exact', head: true }).eq('person_id', id),
  ]);

  const { error } = await supabaseAdmin.from('people').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
  }

  const name = person?.name || 'someone';
  const asks = count || 0;
  await logActivity(req, {
    action: 'person.remove',
    subject: name,
    // no person_id: the row is gone, and the reference would be nulled anyway
    detail: asks ? `Deleted ${name} and her ${asks} ${asks === 1 ? 'ask' : 'asks'}` : `Deleted ${name}`,
    meta: { asks },
  });

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
