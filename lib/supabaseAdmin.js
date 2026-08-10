import { createClient } from '@supabase/supabase-js';

// server-side only — never import this into a client component

let client = null;

function admin() {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    );
  }

  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

// Built on first use rather than at import. `next build` evaluates every route
// module to collect page data, so creating the client at module scope made the
// build itself require the Supabase env vars — and fail with "supabaseUrl is
// required" wherever they aren't present at build time. The proxy keeps the
// call sites reading as `supabaseAdmin.from(...)`; methods are bound to the
// real client so `this` never resolves through the proxy.
export const supabaseAdmin = new Proxy(
  {},
  {
    get(_target, prop) {
      const value = Reflect.get(admin(), prop);
      return typeof value === 'function' ? value.bind(admin()) : value;
    },
  }
);
