import { NextResponse } from 'next/server';
import { currentUser, safeEqual } from '../../../lib/lock';
import { readUsers } from '../../../lib/users';

export const runtime = 'nodejs';

const NO_STORE = { 'cache-control': 'no-store, max-age=0' };

// Does removing someone need the passcode typed? Only if one is configured —
// otherwise there is no secret to check and the confirm step stands alone.
export async function GET() {
  const { users } = readUsers();
  return NextResponse.json({ required: users.length > 0 }, { headers: NO_STORE });
}

// Re-typing the passcode for a destructive action, separate from the session
// cookie: being unlocked shouldn't be the same as meaning to delete her.
//
// It has to be *your* PIN, not any valid one. Carlos's PIN typed into Jon's
// session would otherwise pass, and the deletion would go in the log as Jon's.
export async function POST(req) {
  const { users } = readUsers();
  if (!users.length) return NextResponse.json({ ok: true, required: false }, { headers: NO_STORE });

  const me = await currentUser(req);
  if (!me) return NextResponse.json({ ok: false, required: true }, { status: 401, headers: NO_STORE });

  const { attempt } = await req.json();
  const ok = safeEqual(String(attempt || ''), me.pin);
  return NextResponse.json({ ok, required: true }, { status: ok ? 200 : 401, headers: NO_STORE });
}
