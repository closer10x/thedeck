import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const NO_STORE = { 'cache-control': 'no-store, max-age=0' };

// Turns "Palm Beach" into a point on the earth, once, when you pick the place.
// The answer is stored on her row, so the map never geocodes again — this is
// the only call Google gets billed for, and only when you change where she's
// from.
//
// Same key as the autocomplete, and it stays here: a browser that could call
// Google directly is a browser that can be made to call it a million times.
export async function GET(req) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  const q = (req.nextUrl.searchParams.get('q') || '').trim();

  if (!key) {
    return NextResponse.json({ error: 'no_key' }, { status: 200, headers: NO_STORE });
  }
  if (q.length < 2) {
    return NextResponse.json({ error: 'too_short' }, { status: 200, headers: NO_STORE });
  }

  try {
    const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location',
      },
      body: JSON.stringify({ textQuery: q, maxResultCount: 1 }),
      cache: 'no-store',
    });

    if (!r.ok) {
      const detail = await r.text();
      return NextResponse.json(
        { error: 'upstream', detail: detail.slice(0, 200) },
        { status: 200, headers: NO_STORE }
      );
    }

    const place = (await r.json()).places?.[0];
    const loc = place?.location;
    if (!loc) {
      return NextResponse.json({ error: 'not_found' }, { status: 200, headers: NO_STORE });
    }

    return NextResponse.json(
      {
        // what to show: the short name, not the full postal address
        name: place.displayName?.text || q,
        address: place.formattedAddress || null,
        lat: loc.latitude,
        lng: loc.longitude,
      },
      { headers: NO_STORE }
    );
  } catch (e) {
    return NextResponse.json({ error: 'error' }, { status: 200, headers: NO_STORE });
  }
}
