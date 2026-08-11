'use client';

import { useEffect, useRef, useState } from 'react';

// The interactive map: real Google Maps, pan and zoom, a pin per person.
//
// This one needs its key in the browser — there is no way around that, the
// library runs in the page. So it's a SEPARATE key from the server-side Places
// one, and it only exists if you set NEXT_PUBLIC_MAPS_KEY. Restrict it by HTTP
// referrer in the Google console; that restriction, not secrecy, is what stops
// someone else spending it. Without the variable the app falls back to the
// static map, which keeps the key on the server.
const KEY = process.env.NEXT_PUBLIC_MAPS_KEY;

export const hasInteractiveMap = !!KEY;

// Loaded once per page, however many times this mounts.
let loader = null;
function loadMaps() {
  if (window.google?.maps) return Promise.resolve();
  if (loader) return loader;

  loader = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY)}&loading=async`;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error('script'));
    document.head.appendChild(s);
  });
  return loader;
}

// Night. Google's default map is a sheet of white — beside a dark roster it's
// a torch in the face.
const DARK = [
  { elementType: 'geometry', stylers: [{ color: '#1B1A22' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1B1A22' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#96949F' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0E0D12' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2A2933' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#6E6C7A' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#3A3844' }] },
];

function isDark() {
  const chosen = document.documentElement.dataset.theme;
  if (chosen) return chosen === 'dark';
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

export default function MapCanvas({ people, onOpen, height = 380 }) {
  const box = useRef(null);
  const map = useRef(null);
  const markers = useRef([]);
  const [failed, setFailed] = useState(false);

  // onOpen through a ref: markers are bound once, and a handler captured at
  // bind time would go stale the moment the roster reloads underneath it.
  const open = useRef(onOpen);
  open.current = onOpen;

  useEffect(() => {
    let alive = true;

    loadMaps()
      .then(() => {
        if (!alive || !box.current) return;
        const g = window.google.maps;

        if (!map.current) {
          map.current = new g.Map(box.current, {
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            // one control is enough on a phone; pinch does the rest
            zoomControl: true,
            styles: isDark() ? DARK : undefined,
            center: { lat: 27.9, lng: -82.4 },
            zoom: 6,
          });
        }

        // rebuild the pins from scratch — cheaper than diffing, and this only
        // runs when the located set actually changes
        markers.current.forEach((m) => m.setMap(null));
        markers.current = [];

        const bounds = new g.LatLngBounds();
        for (const p of people) {
          const pos = { lat: Number(p.lat), lng: Number(p.lng) };
          const marker = new g.Marker({
            position: pos,
            map: map.current,
            title: p.city ? `${p.name} — ${p.city}` : p.name,
          });
          marker.addListener('click', () => open.current?.(p.id));
          markers.current.push(marker);
          bounds.extend(pos);
        }

        if (people.length === 1) {
          map.current.setCenter(bounds.getCenter());
          map.current.setZoom(11); // one pin has no extent to fit
        } else if (people.length > 1) {
          map.current.fitBounds(bounds, 48);
        }
      })
      .catch(() => alive && setFailed(true));

    return () => {
      alive = false;
    };
    // the pins are what matter: rebuild when someone's location changes
  }, [people]);

  if (failed) {
    return (
      <Note>
        <strong style={{ color: 'var(--ink)' }}>The map wouldn&apos;t load.</strong>
        <br />
        Check that <strong>Maps JavaScript API</strong> is enabled and that the key allows this
        site.
      </Note>
    );
  }

  return (
    <div
      ref={box}
      style={{
        width: '100%',
        height,
        borderRadius: 16,
        overflow: 'hidden',
        border: '1px solid var(--line)',
        background: 'var(--tint)',
      }}
    />
  );
}

function Note({ children }) {
  return (
    <div
      style={{
        border: '1px solid var(--line)',
        borderRadius: 16,
        padding: '30px 20px',
        textAlign: 'center',
        color: 'var(--muted)',
        fontSize: 13,
        lineHeight: 1.6,
      }}
    >
      {children}
    </div>
  );
}
