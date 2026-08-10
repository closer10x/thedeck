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
