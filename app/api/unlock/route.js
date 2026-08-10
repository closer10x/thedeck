import { NextResponse } from 'next/server';
import { COOKIE, cookieOptions, safeEqual, sessionValue } from '../../../lib/lock';
import { readUsers } from '../../../lib/users';
import { logActivity } from '../../../lib/audit';

export const runtime = 'nodejs';

// The PIN is the identity: four digits say both that you may come in and who
// you are. Nobody picks a name off a list, so nobody can pick the wrong one.
export async function POST(req) {
  const { users, error } = readUsers();
  if (error) return NextResponse.json({ error }, { status: 500 });
  if (!users.length) return NextResponse.json({ error: 'No passcode is set.' }, { status: 400 });

  const { attempt } = await req.json();
  const typed = String(attempt || '');

  // Every user is checked even after a match, so the time this takes doesn't
  // depend on whose PIN it was or where in the list they sit.
  let matched = null;
  for (const user of users) {
    if (safeEqual(typed, user.pin)) matched = user;
  }
  if (!matched) return NextResponse.json({ error: 'Wrong passcode.' }, { status: 401 });

  const res = NextResponse.json({ ok: true, name: matched.name, slug: matched.slug });
  res.cookies.set(COOKIE, await sessionValue(matched), cookieOptions);

  // This request still carries the old session, or none — the name comes from
  // the PIN that just matched, not from the cookie.
  await logActivity(req, {
    actor: matched.name,
    action: 'session.unlock',
    detail: 'Signed in',
  });

  return res;
}
