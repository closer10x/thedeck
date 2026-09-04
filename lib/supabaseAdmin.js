import { createClient } from '@supabase/supabase-js';

// server-side only — never import this into a client component
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false },
    global: {
      // Next patches global fetch and caches inside route handlers. supabase-js
      // goes through that fetch, so a freshly logged ask kept coming back from
      // a cached response — the row was in the database, the roster showed the
      // old list. `dynamic = 'force-dynamic'` and no-store response headers
      // don't cover it; the outgoing request is what needs opting out.
      fetch: (input, init = {}) => fetch(input, { ...init, cache: 'no-store' }),
    },
  }
);

// What the browser is allowed to be told when a query fails.
//
// supabase-js reports whatever came back from the gateway, and when the
// database is unreachable that is a Cloudflare error page — 7KB of HTML, which
// the roster then printed into its banner verbatim under "Couldn't load:". A
// page of markup isn't a message, it's the absence of one, and it buries the
// one fact worth having: this isn't your data, it's the database.
//
// Real Postgres and PostgREST errors are short and say something useful
// ("column people.wingman does not exist"), so those go through untouched —
// they're how the missing-column fallbacks and setup prompts do their job.
export function saidPlainly(error) {
  const raw = String(error?.message || '').trim();
  if (!raw) return "The database didn't say what went wrong.";
  // markup, or long enough to be markup, is the gateway talking rather than
  // the database
  if (/^<(!doctype|html)/i.test(raw) || raw.length > 300) {
    return "The database isn't responding. It's usually back within a few minutes.";
  }
  return raw;
}
