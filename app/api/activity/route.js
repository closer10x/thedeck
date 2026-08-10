import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store, max-age=0' };
const LIMIT = 200;

// The log, newest first. Read-only on purpose — there is no POST, PATCH or
// DELETE here, and nothing anywhere else writes to this table except
// logActivity. A record you can edit from the app isn't a record.
export async function GET(req) {
  const personId = req.nextUrl.searchParams.get('person_id');

  let query = supabaseAdmin
    .from('activity')
    .select('*')
    .order('at', { ascending: false })
    .limit(LIMIT);

  if (personId) query = query.eq('person_id', personId);

  const { data, error } = await query;

  if (error) {
    // The likeliest error by far is the table not existing yet, which is a
    // setup step and not a fault — say which, so the panel can explain itself.
    const missing = /relation .*activity.* does not exist|schema cache/i.test(error.message);
    return NextResponse.json(
      { error: error.message, missing },
      { status: missing ? 200 : 500, headers: NO_STORE }
    );
  }

  return NextResponse.json({ entries: data || [] }, { headers: NO_STORE });
}
