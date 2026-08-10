import { NextResponse } from 'next/server';
import { COOKIE, currentUser } from '../../../lib/lock';
import { logActivity } from '../../../lib/audit';

export const runtime = 'nodejs';

// what the idle timer calls: drop the cookie so the next request lands on /lock
export async function POST(req) {
  // the timer posts nothing at all, so an unreadable body is the normal case
  const body = await req.json().catch(() => ({}));
  const idle = body?.reason === 'idle';

  // Read who it was before the cookie goes, and only log a real session ending
  // — a locked tab that reloads would otherwise write "signed out" as Unknown.
  const user = await currentUser(req);
  if (user) {
    await logActivity(req, {
      action: 'session.lock',
      detail: idle ? 'Locked after going idle' : 'Signed out',
    });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
