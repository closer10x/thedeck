import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Google's Static Maps, fetched by us and handed to the browser as an image.
// The whole point is that the key never leaves the server: an interactive map
// would need one in the page, and a key in a public page is a key anyone can
// spend. The cost is pan and zoom, which a roster of pins doesn't really need.
const ENDPOINT = 'https://maps.googleapis.com/maps/api/staticmap';

// The accent, without the #. Static Maps wants 0x-prefixed hex.
const PIN = '0x4B3BE0';

// Static Maps caps the URL at 8192 characters and starts dropping markers well
// before you'd notice. Nobody's deck is this big, but a silent truncation is
// the kind of bug you find a year later.
const MAX_PINS = 60;

export async function GET(req) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return NextResponse.json({ error: 'no_key' }, { status: 503 });
  }

  const params = req.nextUrl.searchParams;
  const width = Math.min(Number(params.get('w')) || 640, 640);
  const height = Math.min(Number(params.get('h')) || 400, 640);
  const focus = params.get('at'); // "lat,lng" to centre on one person

  const { data, error } = await supabaseAdmin
    .from('people')
    .select('name, lat, lng, archived')
    .not('lat', 'is', null)
    .not('lng', 'is', null);

  if (error) {
    // the columns not existing yet is a setup step, not a fault
    const missing = /column .*(lat|lng|city).* does not exist|schema cache/i.test(error.message);
    return NextResponse.json({ error: error.message, missing }, { status: missing ? 503 : 500 });
  }

  const pins = (data || []).filter((p) => !p.archived).slice(0, MAX_PINS);
  if (!pins.length && !focus) {
    return NextResponse.json({ error: 'no_pins' }, { status: 404 });
  }

  const url = new URL(ENDPOINT);
  url.searchParams.set('size', `${width}x${height}`);
  url.searchParams.set('scale', '2'); // retina; the map is looked at closely
  url.searchParams.set('maptype', 'roadmap');
  url.searchParams.set('key', key);

  if (focus) {
    url.searchParams.set('center', focus);
    url.searchParams.set('zoom', params.get('zoom') || '10');
  }
  // With markers and no centre, Google frames them all itself — which is what
  // you want, and better than any bounding box we'd compute here.
  for (const p of pins) {
    url.searchParams.append('markers', `color:${PIN}|${p.lat},${p.lng}`);
  }

  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) {
      const detail = await r.text();
      // Static Maps is a separate API to enable on the key, and says so plainly
      return NextResponse.json(
        { error: 'upstream', status: r.status, detail: detail.slice(0, 300) },
        { status: 502 }
      );
    }

    return new NextResponse(r.body, {
      headers: {
        'content-type': r.headers.get('content-type') || 'image/png',
        // the pins move when you edit someone, so don't let a stale map stick
        'cache-control': 'private, max-age=60',
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 502 });
  }
}
