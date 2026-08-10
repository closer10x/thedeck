import { NextResponse } from 'next/server';
import { COOKIE, cookieOptions, passcodeHash, safeEqual } from '../../../lib/lock';

export const runtime = 'nodejs';

export async function POST(req) {
  const passcode = process.env.ROLODECK_PIN;
  if (!passcode) {
    return NextResponse.json({ error: 'No passcode is set.' }, { status: 400 });
  }

  const { attempt } = await req.json();
  if (!safeEqual(String(attempt || ''), passcode)) {
    return NextResponse.json({ error: 'Wrong passcode.' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, await passcodeHash(passcode), cookieOptions);
  return res;
}
