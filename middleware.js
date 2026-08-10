import { NextResponse } from 'next/server';
import { COOKIE, cookieOptions, sessionValue, userFromCookie } from './lib/lock';
import { readUsers } from './lib/users';

// The whole app sits behind a PIN pad. Each PIN belongs to a person — see
// lib/users.js — and the cookie carries which one, so everything written from
// here on gets that person's name on it.
export async function middleware(req) {
  const { users, error } = readUsers();
  const { pathname } = req.nextUrl;

  // A malformed ROLODECK_USERS is not a reason to fall back to an open app or
  // to a nameless one. Say what's wrong and serve nothing.
  if (error) {
    return new NextResponse(`Rolodeck users are misconfigured: ${error}`, {
      status: 503,
      headers: { 'content-type': 'text/plain' },
    });
  }

  if (!users.length) {
    // Locally, no PIN means no lock — convenient, and nothing is exposed.
    // Deployed, it would mean an open app and an open /api/upload writing to
    // storage with the service role, so refuse to serve at all instead.
    if (process.env.NODE_ENV === 'production') {
      return new NextResponse(
        'ROLODECK_USERS is not set. Set it in the environment to unlock this deployment.',
        { status: 503, headers: { 'content-type': 'text/plain' } }
      );
    }
    return NextResponse.next();
  }

  // the lock screen and the two doors it uses stay reachable while locked
  if (pathname === '/lock' || pathname === '/api/unlock' || pathname === '/api/lock') {
    return NextResponse.next();
  }

  const user = await userFromCookie(req.cookies.get(COOKIE)?.value || '', users);
  if (user) {
    // slide the window forward on every request, so the five minutes measures
    // idle time rather than capping the whole session
    const res = NextResponse.next();
    res.cookies.set(COOKIE, await sessionValue(user), cookieOptions);
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
