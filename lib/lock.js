// Web Crypto only — this runs in the Edge middleware as well as in the route.
export const COOKIE = 'rolodeck_unlock';

// idle timeout. the cookie carries it, and middleware re-issues it on every
// request, so the window slides while you're using the app and runs out when
// you walk away.
export const IDLE_SECONDS = 5 * 60;

export const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: IDLE_SECONDS,
};

export async function passcodeHash(passcode) {
  const bytes = new TextEncoder().encode(`rolodeck:${passcode}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// length-independent compare so a wrong guess can't be timed
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
