import { NextResponse } from 'next/server';
import { safeEqual } from '../../../lib/lock';

export const runtime = 'nodejs';

const NO_STORE = { 'cache-control': 'no-store, max-age=0' };

// Does removing someone need the passcode typed? Only if one is configured —
// otherwise there is no secret to check and the confirm step stands alone.
export async function GET() {
  return NextResponse.json(
    { required: Boolean(process.env.ROLODECK_PIN) },
    { headers: NO_STORE }
  );
}

// Re-typing the passcode for a destructive action, separate from the session
// cookie: being unlocked shouldn't be the same as meaning to delete her.
export async function POST(req) {
  const passcode = process.env.ROLODECK_PIN;
  if (!passcode) return NextResponse.json({ ok: true, required: false }, { headers: NO_STORE });

  const { attempt } = await req.json();
  const ok = safeEqual(String(attempt || ''), passcode);
  return NextResponse.json({ ok, required: true }, { status: ok ? 200 : 401, headers: NO_STORE });
}
