import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// a 403 from before the API was switched on must not be reused by the browser
const NO_STORE = { 'cache-control': 'no-store, max-age=0' };

// Suggestions for "where are you taking her" — restaurants, bars, beaches.
// The key stays server-side; a NEXT_PUBLIC_ one would ship to every browser
// and Google bills per call. No key configured = no suggestions, and the
// field stays an ordinary text box.
export async function GET(req) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  const q = (req.nextUrl.searchParams.get('q') || '').trim();

  if (!key) return NextResponse.json({ suggestions: [], reason: 'no_key' }, { headers: NO_STORE });
  if (q.length < 3) return NextResponse.json({ suggestions: [] }, { headers: NO_STORE });

  try {
    const r = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat',
      },
      body: JSON.stringify({ input: q }),
      cache: 'no-store',
    });

    if (!r.ok) {
      const detail = await r.text();
      return NextResponse.json(
        { suggestions: [], reason: 'upstream', detail: detail.slice(0, 200) },
        { status: 200, headers: NO_STORE }
      );
    }

    const json = await r.json();
    const suggestions = (json.suggestions || [])
      .map((s) => s.placePrediction)
      .filter(Boolean)
      .slice(0, 5)
      .map((p) => ({
        main: p.structuredFormat?.mainText?.text || p.text?.text || '',
        secondary: p.structuredFormat?.secondaryText?.text || '',
      }))
      .filter((s) => s.main);

    return NextResponse.json({ suggestions }, { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json({ suggestions: [], reason: 'error' }, { headers: NO_STORE });
  }
}
