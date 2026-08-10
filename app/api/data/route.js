import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export const runtime = 'nodejs';
// A plain GET with no request-dependent input, so Next would otherwise
// prerender it and bake one roster into the build output.
export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store, max-age=0' };

// The whole roster in one call. This exists so the browser never holds a
// Supabase key: RLS is on with no policies, so only the service role can read
// these tables, and the service role only lives here — behind the PIN gate in
// middleware.js.
export async function GET() {
  const [p, i] = await Promise.all([
    supabaseAdmin.from('people').select('*').order('created_at', { ascending: false }),
    supabaseAdmin.from('invites').select('*').order('invited_at', { ascending: false }),
  ]);

  const error = p.error || i.error;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
  }
  return NextResponse.json(
    { people: p.data || [], invites: i.data || [] },
    { headers: NO_STORE }
  );
}
