// Web Crypto only — this runs in the Edge middleware as well as in the routes.
import { readUsers, userBySlug } from './users';

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

export async function sha256Hex(input) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// The cookie has to say *who* is signed in now, and the name half is readable
// by anyone holding the cookie — so it can't be trusted on its own. Binding the
// hash to the name means a cookie that claims to be Carlos only verifies if it
// was minted with Carlos's PIN. Swapping the name in a stolen cookie breaks it.
export function stampFor(user) {
  return sha256Hex(`rolodeck:${user.slug}:${user.pin}`);
}

export async function sessionValue(user) {
  return `${user.slug}.${await stampFor(user)}`;
}

// length-independent compare so a wrong guess can't be timed
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Who does this cookie prove you are? null when it proves nothing — expired,
// forged, tampered with, or minted before a PIN changed.
export async function userFromCookie(value, users) {
  if (!value || typeof value !== 'string') return null;

  const dot = value.indexOf('.');
  if (dot < 1) return null;

  const user = userBySlug(users, value.slice(0, dot));
  if (!user) return null;

  return safeEqual(value.slice(dot + 1), await stampFor(user)) ? user : null;
}

// What the route handlers call. They re-verify the cookie themselves rather
// than trusting a header from middleware — a request header is something the
// browser can set, and the name on it decides whose name goes in the log.
export async function currentUser(req) {
  const { users, error } = readUsers();
  if (error || !users.length) return null;
  return userFromCookie(req.cookies?.get(COOKIE)?.value || '', users);
}

// The name to write in the log. Falls back rather than throwing: an unnamed
// entry is worse than no write, but a lost write is worse than both.
export async function actorName(req) {
  return (await currentUser(req))?.name || 'Unknown';
}
