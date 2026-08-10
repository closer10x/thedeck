export const OUTCOME_EMOJI = {
  yes: '\u2705',      // showed up
  pending: '\u23F3',  // waiting on her
  no: '\u274C',       // said no
  ghost: '\uD83D\uDC7B', // ghosted
};

// US formatting as you type: 3103104861 -> (310) 310-4861. Leading 1 is the
// country code and gets dropped so pasting +1 numbers doesn't shift everything.
export function formatUSPhone(value) {
  let d = (value || '').replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  d = d.slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export const TIERS = {
  a: { label: 'A', color: 'var(--accent)', bg: 'var(--accent-tint)' },
  b: { label: 'B', color: 'var(--good)', bg: 'var(--good-tint)' },
  c: { label: 'C', color: 'var(--muted)', bg: 'var(--tint)' },
};

export function daysSince(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

// "just now", "4m", "3h", "Tue", "Mar 2" — the log is read newest-first, so
// recent entries get precision and old ones get a date.
export function ago(iso) {
  if (!iso) return '';
  const then = new Date(iso);
  const mins = Math.floor((Date.now() - then.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.floor(mins / 60)}h ago`;
  if (mins < 60 * 24 * 7) return then.toLocaleDateString(undefined, { weekday: 'short' });
  const opts = { month: 'short', day: 'numeric' };
  if (then.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return then.toLocaleDateString(undefined, opts);
}

// how cold someone has gone. drives the temp bar + day badge color.
export function temp(days) {
  if (days === null) return { pct: 0, color: 'var(--muted)', bg: 'var(--tint)', label: 'new' };
  if (days <= 7) return { pct: 1, color: 'var(--good)', bg: 'var(--good-tint)', label: `${days}d` };
  if (days <= 21) return { pct: 0.6, color: 'var(--warn)', bg: 'var(--warn-tint)', label: `${days}d` };
  if (days <= 60) return { pct: 0.3, color: 'var(--bad)', bg: 'var(--bad-tint)', label: `${days}d` };
  return { pct: 0.08, color: 'var(--bad)', bg: 'var(--bad-tint)', label: `${days}d` };
}

export function rate(invites) {
  const asked = invites.length;
  if (!asked) return null;
  const yes = invites.filter((i) => i.outcome === 'yes').length;
  return Math.round((yes / asked) * 100);
}

// instagram.com/<this> is a route, not a person. a post link carries no handle
// at all, so the honest answer there is "no handle in that" rather than "p".
const NOT_HANDLES = new Set([
  'p',
  'reel',
  'reels',
  'stories',
  'tv',
  's',
  'explore',
  'accounts',
  'direct',
  'about',
  'legal',
  'developer',
  'challenge',
  'privacy',
  'terms',
]);

// pull a handle out of anything pasted: url, @handle, bare handle
export function parseHandle(input) {
  if (!input) return null;
  const s = String(input).trim();
  const url = s.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  if (url) {
    const seg = url[1].replace(/\/$/, '');
    return NOT_HANDLES.has(seg.toLowerCase()) ? null : seg;
  }
  const at = s.match(/^@([A-Za-z0-9._]+)$/);
  if (at) return at[1];
  if (/^[A-Za-z0-9._]{2,30}$/.test(s) && !s.includes(' ')) return s;
  return null;
}

export function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}
