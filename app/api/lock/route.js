import { NextResponse } from 'next/server';
import { COOKIE } from '../../../lib/lock';

export const runtime = 'nodejs';

// what the idle timer calls: drop the cookie so the next request lands on /lock
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
