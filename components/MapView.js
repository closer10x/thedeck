'use client';

import { useMemo, useState } from 'react';
import { MapPin, ExternalLink } from 'lucide-react';
import Avatar from './Avatar';
import MapCanvas, { hasInteractiveMap } from './MapCanvas';

const C = {
  surface: 'var(--surface)',
  ink: 'var(--ink)',
  muted: 'var(--muted)',
  line: 'var(--line)',
  accent: 'var(--accent)',
};

// A picture of the map, drawn by our own server so the key stays there. The
// `n` is a cache-buster: the pins move whenever someone's city changes, and a
// browser holding yesterday's image is worse than a slow one.
function mapSrc(people) {
  const stamp = people
    .map((p) => `${p.id}:${p.lat},${p.lng}`)
    .sort()
    .join('|');
  // a short hash of who's on it — changes when the pins do, and only then
  let h = 0;
  for (let i = 0; i < stamp.length; i++) h = (h * 31 + stamp.charCodeAt(i)) | 0;
  return `/api/map?w=640&h=380&v=${h}`;
}

export default function MapView({ people, onOpen }) {
  const [failed, setFailed] = useState(false);

  const placed = useMemo(
    () => people.filter((p) => !p.archived && p.lat != null && p.lng != null),
    [people]
  );
  const unplaced = useMemo(
    () => people.filter((p) => !p.archived && (p.lat == null || p.lng == null)),
    [people]
  );

  // Group by the name typed, not by coordinate: two people who both said
  // "Tampa" belong together even if Google put them a few metres apart.
  const byCity = useMemo(() => {
    const m = new Map();
    for (const p of placed) {
      const key = (p.city || 'Somewhere').trim();
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(p);
    }
    // the fullest city first — that's the one you're actually working
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [placed]);

  if (!placed.length) {
    return (
      <Note>
        {unplaced.length
          ? 'Nobody has a city yet. Open someone and fill in From — she shows up here once Google has placed it.'
          : 'Nobody on the deck yet.'}
      </Note>
    );
  }

  // A real draggable map when there's a browser key to load it with, and the
  // server-drawn picture when there isn't. Same pins either way — the only
  // difference is whether you can move it.
  if (hasInteractiveMap) {
    return (
      <>
        <div style={{ marginBottom: 14 }}>
          <MapCanvas people={placed} onOpen={onOpen} />
        </div>
        <Cities byCity={byCity} onOpen={onOpen} />
        <Unplaced n={unplaced.length} />
      </>
    );
  }

  return (
    <>
      <div
        style={{
          position: 'relative',
          borderRadius: 16,
          overflow: 'hidden',
          border: `1px solid ${C.line}`,
          background: 'var(--tint)',
          marginBottom: 14,
        }}
      >
        {failed ? (
          // The picture is the only part that needs this API. Everything below
          // — the cities, the grouping, the links out to Google Maps — works
          // without it, so this says what's missing rather than looking broken.
          <div
            style={{
              padding: '30px 20px',
              textAlign: 'center',
              color: C.muted,
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            <div style={{ color: C.ink, fontWeight: 600, marginBottom: 6 }}>
              The map picture needs one more Google API
            </div>
            Enable <strong>Maps Static API</strong> on the same Google Cloud project as your
            Places key, and this fills in. Everyone&apos;s city is already saved, and the
            list below works either way.
          </div>
        ) : (
          <img
            src={mapSrc(placed)}
            alt={`Map of ${placed.length} ${placed.length === 1 ? 'person' : 'people'}`}
            onError={() => setFailed(true)}
            style={{ display: 'block', width: '100%', height: 'auto' }}
          />
        )}

        {!failed && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
              `${placed[0].lat},${placed[0].lng}`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              position: 'absolute',
              right: 10,
              bottom: 10,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 10px',
              borderRadius: 999,
              background: 'var(--surface)',
              border: `1px solid ${C.line}`,
              color: C.ink,
              fontSize: 11.5,
              fontWeight: 600,
              textDecoration: 'none',
              boxShadow: '0 2px 8px var(--shadow)',
            }}
          >
            <ExternalLink size={12} /> Google Maps
          </a>
        )}
      </div>

      <Cities byCity={byCity} onOpen={onOpen} />
      <Unplaced n={unplaced.length} />
    </>
  );
}

// The list under the map, whichever map is above it.
function Cities({ byCity, onOpen }) {
  return byCity.map(([city, group]) => (
    <div key={city} style={{ marginBottom: 16 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          fontFamily: 'var(--mono), monospace',
          fontSize: 10.5,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: C.muted,
          marginBottom: 8,
        }}
      >
        <MapPin size={12} /> {city} · {group.length}
      </div>

      <div
        style={{
          background: C.surface,
          borderRadius: 16,
          border: `1px solid ${C.line}`,
          overflow: 'hidden',
        }}
      >
        {group.map((p, i) => (
          <button
            key={p.id}
            onClick={() => onOpen(p.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              width: '100%',
              padding: '12px 14px',
              background: 'transparent',
              border: 'none',
              borderTop: i ? '1px solid var(--hairline)' : 'none',
              textAlign: 'left',
            }}
          >
            <Avatar name={p.name} url={p.photo_url} size={42} ring={!!p.ig_handle} />
            <span
              style={{
                flex: 1,
                minWidth: 0,
                fontFamily: 'var(--display), sans-serif',
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: '-0.015em',
                color: C.ink,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {p.name}
            </span>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              aria-label={`Open ${p.name}'s city in Google Maps`}
              style={{ display: 'flex', color: 'var(--faint)', padding: 4 }}
            >
              <ExternalLink size={14} />
            </a>
          </button>
        ))}
      </div>
    </div>
  ));
}

// Said plainly rather than left as a silent absence — otherwise the map looks
// like the whole deck and quietly isn't.
function Unplaced({ n }) {
  if (!n) return null;
  return (
    <div
      style={{
        fontSize: 12.5,
        color: C.muted,
        textAlign: 'center',
        padding: '4px 8px 8px',
        lineHeight: 1.5,
      }}
    >
      {n} {n === 1 ? 'person has' : 'people have'} no city yet, so
      {n === 1 ? " she isn't" : " they aren't"} on the map.
    </div>
  );
}

function Note({ children }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: `1px solid ${C.line}`,
        borderRadius: 16,
        padding: '38px 22px',
        textAlign: 'center',
        color: C.muted,
        fontSize: 14,
        lineHeight: 1.55,
      }}
    >
      {children}
    </div>
  );
}
