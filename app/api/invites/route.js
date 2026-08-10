import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export const runtime = 'nodejs';

const NO_STORE = { 'cache-control': 'no-store, max-age=0' };
const OUTCOMES = ['pending', 'yes', 'no', 'ghost'];

export async function POST(req) {
  const { person_id, what, outcome, invited_at } = await req.json();
  if (!person_id) {
    return NextResponse.json({ error: 'No person.' }, { status: 400, headers: NO_STORE });
  }

  const { data, error } = await supabaseAdmin
    .from('invites')
    .insert({
      person_id,
      what: what || null,
      outcome: OUTCOMES.includes(outcome) ? outcome : 'pending',
      invited_at: invited_at || new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
  }
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

  const { error } = await supabaseAdmin.from('invites').update(patch).eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

export async function DELETE(req) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'No id.' }, { status: 400, headers: NO_STORE });

  const { error } = await supabaseAdmin.from('invites').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
