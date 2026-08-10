// Who can get in, and what each of them is called.
//
// Edge-safe: this is read by middleware as well as by the route handlers, so
// nothing in here touches node APIs.
//
// ROLODECK_USERS="Jon:1982,Carlos:1980"
//
// The PIN is the whole identity. There is no username field on the lock screen
// because the PIN already says who you are — four digits get you in *as
// someone*, and everything you then do is written down under that name.

// One user, unnamed, is still the old ROLODECK_PIN behaviour. Kept so an
// existing deployment that only sets ROLODECK_PIN keeps working.
const LEGACY_NAME = 'Owner';

export function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Both names are written out literally. Next inlines `process.env.SOMETHING`
// into the Edge bundle at build time, and middleware is Edge — reading the same
// values off a dynamic `process.env[key]` lookup gets undefined there, which
// would read as "no PIN set" and take the lock off the deployed app.
export function envUsers() {
  return {
    ROLODECK_USERS: process.env.ROLODECK_USERS,
    ROLODECK_PIN: process.env.ROLODECK_PIN,
  };
}

// Returns { users, error }. An error means the app refuses to serve rather
// than guessing — see middleware.js. Every failure here is a config mistake
// that would otherwise attribute someone's edits to the wrong person.
export function readUsers(env = envUsers()) {
  const raw = (env.ROLODECK_USERS || '').trim();

  if (!raw) {
    const pin = (env.ROLODECK_PIN || '').trim();
    if (!pin) return { users: [], error: null };
    return { users: [{ name: LEGACY_NAME, slug: slugify(LEGACY_NAME), pin }], error: null };
  }

  const users = [];
  for (const entry of raw.split(',')) {
    const part = entry.trim();
    if (!part) continue;

    // last colon wins, so a name can't be broken by one
    const cut = part.lastIndexOf(':');
    if (cut < 1) {
      return { users: [], error: `ROLODECK_USERS entry "${part}" is not Name:PIN.` };
    }

    const name = part.slice(0, cut).trim();
    const pin = part.slice(cut + 1).trim();
    if (!name || !pin) {
      return { users: [], error: `ROLODECK_USERS entry "${part}" is missing a name or a PIN.` };
    }
    if (!/^[0-9]{4}$/.test(pin)) {
      return { users: [], error: `${name}'s PIN must be four digits.` };
    }

    const slug = slugify(name);
    if (!slug) return { users: [], error: `"${name}" doesn't make a usable name.` };
    if (users.some((u) => u.slug === slug)) {
      return { users: [], error: `Two users are both called "${name}".` };
    }
    // Two people sharing a PIN would make the log a lie: whoever's listed
    // first would get credited with the other's edits. Refuse instead.
    if (users.some((u) => u.pin === pin)) {
      return { users: [], error: `Two users share the PIN ending ${pin.slice(-2)}.` };
    }

    users.push({ name, slug, pin });
  }

  if (!users.length) return { users: [], error: 'ROLODECK_USERS is set but empty.' };
  return { users, error: null };
}

export function userBySlug(users, slug) {
  return users.find((u) => u.slug === slug) || null;
}
