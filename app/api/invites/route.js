import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { actorName } from '../../../lib/lock';
import { logActivity } from '../../../lib/audit';

export const runtime = 'nodejs';

const NO_STORE = { 'cache-control': 'no-store, max-age=0' };
const OUTCOMES = ['pending', 'yes', 'no', 'ghost'];

// how each outcome reads in the log
const OUTCOME_WORD = {
  pending: 'waiting',
  yes: 'a yes',
  no: 'a no',
  ghost: 'a ghost',
};

async function nameOf(personId) {
  const { data } = await supabaseAdmin.from('people').select('name').eq('id', personId).maybeSingle();
  return data?.name || 'someone';
}

export async function POST(req) {
  const { person_id, what, outcome, invited_at } = await req.json();
  if (!person_id) {
    return NextResponse.json({ error: 'No person.' }, { status: 400, headers: NO_STORE });
  }

  const chosen = OUTCOMES.includes(outcome) ? outcome : 'pending';
  const { data, error } = await supabaseAdmin
    .from('invites')
    .insert({
      person_id,
      what: what || null,
      outcome: chosen,
      invited_at: invited_at || new Date().toISOString(),
      created_by: await actorName(req),
    })
    .select('id')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
  }

  const name = await nameOf(person_id);
  await logActivity(req, {
    action: 'ask.add',
    subject: name,
    person_id,
    detail: what ? `Logged an ask: ${name} — ${what}` : `Logged an ask for ${name}`,
    meta: { what: what || null, outcome: chosen },
  });

  return NextResponse.json({ id: data.id }, { headers: NO_STORE });
}

// outcome and note are the only things an ask can change after the fact
export async function PATCH(req) {
  const { id, outcome, note } = await req.json();
  if (!id) return NextResponse.json({ error: 'No id.' }, { status: 400, headers: NO_STORE });

  const patch = {};
  if (outcome !== undefined) {
    if (!OUTCOMES.includes(outcome)) {
      return NextResponse.json({ error: 'Bad outcome.' }, { status: 400, headers: NO_STORE });
    }
    patch.outcome = outcome;
  }
  if (note !== undefined) patch.note = note || null;

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: 'Nothing to change.' }, { status: 400, headers: NO_STORE });
  }

  // what it was, so the entry can read "no → yes" rather than just "yes"
  const { data: before } = await supabaseAdmin
    .from('invites')
    .select('person_id, what, outcome, note')
    .eq('id', id)
    .maybeSingle();

  const { error } = await supabaseAdmin.from('invites').update(patch).eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
  }

  if (before) {
    const name = await nameOf(before.person_id);
    const asked = before.what ? ` (${before.what})` : '';

    if (patch.outcome !== undefined && patch.outcome !== before.outcome) {
      await logActivity(req, {
        action: 'ask.outcome',
        subject: name,
        person_id: before.person_id,
        detail: `Marked ${name}'s ask${asked} as ${OUTCOME_WORD[patch.outcome]}`,
        meta: { from: before.outcome, to: patch.outcome },
      });
    }
    if (patch.note !== undefined && (patch.note || null) !== (before.note || null)) {
      await logActivity(req, {
        action: 'ask.note',
        subject: name,
        person_id: before.person_id,
        detail: patch.note
          ? `Noted why on ${name}'s ask${asked}: ${patch.note}`
          : `Cleared the note on ${name}'s ask${asked}`,
        meta: { note: patch.note || null },
      });
    }
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

export async function DELETE(req) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'No id.' }, { status: 400, headers: NO_STORE });

  const { data: before } = await supabaseAdmin
    .from('invites')
    .select('person_id, what, invited_at')
    .eq('id', id)
    .maybeSingle();

  const { error } = await supabaseAdmin.from('invites').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
  }

  if (before) {
    const name = await nameOf(before.person_id);
    await logActivity(req, {
      action: 'ask.remove',
      subject: name,
      person_id: before.person_id,
      detail: before.what ? `Deleted an ask: ${name} — ${before.what}` : `Deleted an ask for ${name}`,
      meta: { what: before.what || null, invited_at: before.invited_at || null },
    });
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
