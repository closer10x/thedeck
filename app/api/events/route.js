import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { actorName } from '../../../lib/lock';
import { logActivity, changedFields, andList } from '../../../lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store, max-age=0' };
const LOGGED = ['name', 'at', 'place', 'note'];
const LABELS = { name: 'name', at: 'date', place: 'place', note: 'note' };

// The sheet offers a day, never a time, so two timestamps on the same day mean
// the same thing. Comparing the raw values instead turned re-saving an
// untouched date — which the date input does the moment it round-trips through
// the picker — into "Jon updated the date", for a date nobody had changed.
function sameDay(a, b) {
  if (!a || !b) return !a && !b;
  const day = (v) => {
    const d = new Date(v);
    return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
  };
  return day(a) === day(b);
}

function eventChanges(before, row) {
  return LOGGED.filter((f) =>
    f === 'at'
      ? !sameDay(before.at, row.at)
      : JSON.stringify(before[f] ?? null) !== JSON.stringify(row[f] ?? null)
  );
}

// the table not existing yet is a setup step, not a fault — see supabase/events.sql
function isMissing(message) {
  return /relation .*(events|event_people).* does not exist|schema cache/i.test(message || '');
}

function sanitize(body) {
  return {
    name: String(body.name || '').trim(),
    // an event without a date is a real thing — "sometime this summer"
    at: body.at || null,
    place: body.place || null,
    note: body.note || null,
  };
}

// Events and their guests in one call, same shape as /api/data: two flat lists,
// stitched together in the client. Saves a round trip per event.
export async function GET() {
  const [e, g] = await Promise.all([
    supabaseAdmin.from('events').select('*').order('at', { ascending: false, nullsFirst: false }),
    supabaseAdmin.from('event_people').select('*'),
  ]);

  const error = e.error || g.error;
  if (error) {
    const missing = isMissing(error.message);
    return NextResponse.json(
      { error: error.message, missing },
      { status: missing ? 200 : 500, headers: NO_STORE }
    );
  }
  return NextResponse.json(
    { events: e.data || [], guests: g.data || [] },
    { headers: NO_STORE }
  );
}

export async function POST(req) {
  const body = await req.json();
  const row = sanitize(body);

  if (!row.name) {
    return NextResponse.json({ error: 'The event needs a name.' }, { status: 400, headers: NO_STORE });
  }

  if (!body.id) {
    const res = await supabaseAdmin
      .from('events')
      .insert({ ...row, created_by: await actorName(req) })
      .select('id')
      .single();

    if (res.error) {
      const missing = isMissing(res.error.message);
      return NextResponse.json(
        { error: res.error.message, missing },
        { status: missing ? 400 : 500, headers: NO_STORE }
      );
    }
    await logActivity(req, {
      action: 'event.add',
      subject: row.name,
      detail: `Created the event ${row.name}`,
      meta: { event_id: res.data.id },
    });
    return NextResponse.json({ id: res.data.id }, { headers: NO_STORE });
  }

  // read first so the log can name what changed, same as people do
  const { data: before } = await supabaseAdmin
    .from('events')
    .select('*')
    .eq('id', body.id)
    .maybeSingle();

  const res = await supabaseAdmin.from('events').update(row).eq('id', body.id).select('id').single();
  if (res.error) {
    return NextResponse.json({ error: res.error.message }, { status: 500, headers: NO_STORE });
  }

  if (before) {
    const changed = eventChanges(before, row);
    if (changed.length) {
      const renamed = changed.includes('name');
      await logActivity(req, {
        action: 'event.update',
        subject: row.name,
        detail: renamed
          ? `Renamed the event ${before.name} to ${row.name}`
          : `Updated ${row.name}'s ${andList(changed.map((f) => LABELS[f] || f))}`,
        meta: { event_id: body.id, fields: changed },
      });
    }
  }

  return NextResponse.json({ id: res.data.id }, { headers: NO_STORE });
}

export async function DELETE(req) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'No id.' }, { status: 400, headers: NO_STORE });

  // the name and the headcount have to be read before the row goes
  const [{ data: event }, { count }] = await Promise.all([
    supabaseAdmin.from('events').select('name').eq('id', id).maybeSingle(),
    supabaseAdmin.from('event_people').select('id', { count: 'exact', head: true }).eq('event_id', id),
  ]);

  const { error } = await supabaseAdmin.from('events').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
  }

  const name = event?.name || 'an event';
  const guests = count || 0;
  await logActivity(req, {
    action: 'event.remove',
    subject: name,
    detail: guests
      ? `Deleted the event ${name} and its ${guests} ${guests === 1 ? 'guest' : 'guests'}`
      : `Deleted the event ${name}`,
    meta: { guests },
  });

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
