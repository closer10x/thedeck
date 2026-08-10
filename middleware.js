import { NextResponse } from 'next/server';
import { COOKIE, cookieOptions, passcodeHash, safeEqual } from './lib/lock';

// The whole app sits behind one PIN. Set ROLODECK_PIN to turn the lock on.
export async function middleware(req) {
  const pin = process.env.ROLODECK_PIN;
  const { pathname } = req.nextUrl;

  if (!pin) {
    // Locally, no PIN means no lock — convenient, and nothing is exposed.
    // Deployed, it would mean an open app and an open /api/upload writing to
    // storage with the service role, so refuse to serve at all instead.
    if (process.env.NODE_ENV === 'production') {
      return new NextResponse(
        'ROLODECK_PIN is not set. Set it in the environment to unlock this deployment.',
        { status: 503, headers: { 'content-type': 'text/plain' } }
      );
    }
    return NextResponse.next();
  }

  // the lock screen and the two doors it uses stay reachable while locked
  if (pathname === '/lock' || pathname === '/api/unlock' || pathname === '/api/lock') {
    return NextResponse.next();
  }

  const expected = await passcodeHash(pin);
  if (safeEqual(req.cookies.get(COOKIE)?.value || '', expected)) {
    // slide the window forward on every request, so the five minutes measures
    // idle time rather than capping the whole session
    const res = NextResponse.next();
    res.cookies.set(COOKIE, expected, cookieOptions);
    return res;
  }

  // API calls get a status, not a redirect into an HTML page
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'locked' }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = '/lock';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
