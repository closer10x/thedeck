import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { actorName } from '../../../lib/lock';
import { logActivity } from '../../../lib/audit';

export const runtime = 'nodejs';

const NO_STORE = { 'cache-control': 'no-store, max-age=0' };
const STATUSES = ['coming', 'maybe', 'came', 'noshow'];

// how each status reads in the log
const WORD = {
  coming: 'coming',
  maybe: 'a maybe',
  came: 'there',
  noshow: 'a no-show',
};

// Both names, in one round trip. Every entry here is about a person AND an
// event, and reads wrong if either is an id.
async function names(personId, eventId) {
  const [p, e] = await Promise.all([
    supabaseAdmin.from('people').select('name').eq('id', personId).maybeSingle(),
    supabaseAdmin.from('events').select('name').eq('id', eventId).maybeSingle(),
  ]);
  return { person: p.data?.name || 'someone', event: e.data?.name || 'the event' };
}

export async function POST(req) {
  const { event_id, person_id, status } = await req.json();
  if (!event_id || !person_id) {
    return NextResponse.json({ error: 'Need both an event and a person.' }, { status: 400, headers: NO_STORE });
  }

  const { data, error } = await supabaseAdmin
    .from('event_people')
    .insert({
      event_id,
      person_id,
      status: STATUSES.includes(status) ? status : 'coming',
      created_by: await actorName(req),
    })
    .select('id')
    .single();

  if (error) {
    // the unique constraint doing its job — she's already on the list
    if (error.code === '23505') {
      return NextResponse.json({ error: 'She’s already on this one.' }, { status: 409, headers: NO_STORE });
    }
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
  }

  const n = await names(person_id, event_id);
  await logActivity(req, {
    action: 'event.guest.add',
    subject: n.person,
    // linked to her, so this shows up in her own history too
    person_id,
    detail: `Added ${n.person} to ${n.event}`,
    meta: { event_id },
  });

  return NextResponse.json({ id: data.id }, { headers: NO_STORE });
}

export async function PATCH(req) {
  const { id, status } = await req.json();
  if (!id) return NextResponse.json({ error: 'No id.' }, { status: 400, headers: NO_STORE });
  if (!STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Bad status.' }, { status: 400, headers: NO_STORE });
  }

  const { data: before } = await supabaseAdmin
    .from('event_people')
    .select('event_id, person_id, status')
    .eq('id', id)
    .maybeSingle();

  const { error } = await supabaseAdmin.from('event_people').update({ status }).eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
  }

  if (before && before.status !== status) {
    const n = await names(before.person_id, before.event_id);
    await logActivity(req, {
      action: 'event.guest.status',
      subject: n.person,
      person_id: before.person_id,
      detail: `Marked ${n.person} as ${WORD[status]} for ${n.event}`,
      meta: { event_id: before.event_id, from: before.status, to: status },
    });
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

export async function DELETE(req) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'No id.' }, { status: 400, headers: NO_STORE });

  const { data: before } = await supabaseAdmin
    .from('event_people')
    .select('event_id, person_id')
    .eq('id', id)
    .maybeSingle();

  const { error } = await supabaseAdmin.from('event_people').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
  }

  if (before) {
    const n = await names(before.person_id, before.event_id);
    await logActivity(req, {
      action: 'event.guest.remove',
      subject: n.person,
      person_id: before.person_id,
      detail: `Took ${n.person} off ${n.event}`,
      meta: { event_id: before.event_id },
    });
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
