'use client';

import { useEffect, useRef, useState } from 'react';
import { initials } from '../lib/format';

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
  // `google.maps` exists as a stub long before Map does — check the constructor
  // we actually need, or a second mount races the first one's initialisation.
  if (window.google?.maps?.Map) return Promise.resolve();
  if (loader) return loader;

  loader = new Promise((resolve, reject) => {
    // With loading=async, the script's onload fires when the *bootstrap* has
    // downloaded, not when the library is ready — google.maps.Map can still be
    // undefined at that point, and constructing one throws. Google's callback
    // is the only signal that it's genuinely ready, and loading=async requires
    // one. Resolving on onload instead is a race that loses on slower devices.
    const done = '__deckMapsReady';
    window[done] = () => {
      delete window[done];
      resolve();
    };

    const s = document.createElement('script');
    s.src =
      'https://maps.googleapis.com/maps/api/js' +
      `?key=${encodeURIComponent(KEY)}&loading=async&callback=${done}`;
    s.async = true;
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

// Her face as the pin. Drawn into a canvas rather than handed to Google as an
// image, because a marker icon can't be made round or given a ring — and the
// white ring is what separates a face from the map underneath it.
//
// Canvas also means no Map ID and no Advanced Markers, which would each be
// another thing to configure in the Google console.
// Drawn at 2x and shown at half, so it stays sharp on a phone. The face is the
// head of the pin and the tail below it points at the actual spot — the anchor
// sits on that tip, not on her chin.
const PIN_W = 108;
const PIN_H = 134;

// Everyone from Tampa gets Google's one answer for "Tampa", so their pins land
// on the exact same point and all but the last drawn disappears underneath it.
// A shared spot is fanned into a ring instead: two people sit left and right of
// where they're from, three make a triangle, and nobody is buried. The ring is
// sized so neighbouring pins just clear each other — half a pin's width plus a
// little air — which means it grows with the crowd rather than packing them
// tighter the more of them there are.
function ringOffsets(n) {
  if (n < 2) return [{ dx: 0, dy: 0 }];
  const spacing = PIN_W / 2 + 4; // pins are drawn at half size on the map
  const radius = spacing / (2 * Math.sin(Math.PI / n));
  // start at due west so a pair reads as side by side rather than stacked
  return Array.from({ length: n }, (_, i) => {
    const angle = Math.PI + (2 * Math.PI * i) / n;
    return { dx: radius * Math.cos(angle), dy: radius * Math.sin(angle) };
  });
}

// Two people are "in the same place" when Google handed back the same answer.
// Rounding to five decimals is about a metre — far tighter than any two cities
// and loose enough that float noise doesn't split a pair apart.
function spotKey(p) {
  return `${Number(p.lat).toFixed(5)},${Number(p.lng).toFixed(5)}`;
}
const HEAD_R = 54; // centre of the circular head
const RING = 7;

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    // Supabase serves the bucket with permissive CORS; without this the canvas
    // is tainted and toDataURL throws, so a failure here falls back to initials
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function avatarPin(person) {
  const c = document.createElement('canvas');
  c.width = PIN_W;
  c.height = PIN_H;
  const x = c.getContext('2d');
  const cx = PIN_W / 2;
  const cy = HEAD_R;
  const outer = HEAD_R - 5;

  // One white shape — round head, tapering to the point that marks the spot.
  // Drawn as a single path so the shadow falls around the whole pin rather
  // than showing a seam where the tail meets the head.
  x.save();
  x.beginPath();
  // the head, leaving a gap at the bottom for the tail to spring from
  x.arc(cx, cy, outer, Math.PI * 0.82, Math.PI * 0.18);
  x.lineTo(cx, PIN_H - 4); // down to the tip
  x.closePath();
  x.fillStyle = '#ffffff';
  x.shadowColor = 'rgba(0,0,0,0.42)';
  x.shadowBlur = 9;
  x.shadowOffsetY = 3;
  x.fill();
  x.restore();

  const img = person.photo_url ? await loadImage(person.photo_url) : null;
  const inner = outer - RING;

  x.save();
  x.beginPath();
  x.arc(cx, cy, inner, 0, Math.PI * 2);
  x.clip();

  if (img) {
    // cover, not stretch: crop the long side rather than squashing her face
    const side = Math.min(img.width, img.height);
    x.drawImage(
      img,
      (img.width - side) / 2,
      (img.height - side) / 2,
      side,
      side,
      cx - inner,
      cy - inner,
      inner * 2,
      inner * 2
    );
  } else {
    x.fillStyle = '#4B3BE0';
    x.fillRect(cx - inner, cy - inner, inner * 2, inner * 2);
    x.fillStyle = '#ffffff';
    x.font = `600 ${inner * 0.72}px system-ui, sans-serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(initials(person.name) || '?', cx, cy + 2);
  }
  x.restore();

  try {
    return c.toDataURL('image/png');
  } catch {
    return null; // tainted canvas — caller falls back to a plain marker
  }
}

export default function MapCanvas({ people, onOpen, height = 380 }) {
  const box = useRef(null);
  const map = useRef(null);
  const markers = useRef([]);
  const reseatListener = useRef(null);
  const [failed, setFailed] = useState(false);
  const [why, setWhy] = useState('');

  // Google refuses a key at *runtime*, not when serving the library — a bad
  // referrer or a disabled API still returns the script, then paints a grey
  // rectangle you can't drag and logs to the console. gm_authFailure is the one
  // hook it gives us. Without this the map just looks broken and says nothing.
  useEffect(() => {
    window.gm_authFailure = () => {
      setFailed(true);
      setWhy(
        'Google rejected the key for this site. In the Google console, the key’s ' +
          'website restrictions must include the full address with https:// — and ' +
          'Maps JavaScript API has to be enabled on it.'
      );
    };
    return () => {
      delete window.gm_authFailure;
    };
  }, []);

  // onOpen through a ref: markers are bound once, and a handler captured at
  // bind time would go stale the moment the roster reloads underneath it.
  const open = useRef(onOpen);
  open.current = onOpen;

  useEffect(() => {
    let alive = true;

    loadMaps()
      // Only a genuine load failure gets the load message. Wrapping the build
      // below in the same catch is what made a bug in *our* code report itself
      // as "check your Google key", and sent a config hunt after a race.
      .catch(() => {
        if (alive) {
          setFailed(true);
          setWhy('The Google Maps library could not be fetched. Check the connection.');
        }
        throw new Error('handled');
      })
      .then(async () => {
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

        // Faces are drawn in parallel — one slow photo shouldn't hold up the
        // rest of the pins, and a failed one just comes back null.
        const icons = await Promise.all(people.map((p) => avatarPin(p)));
        if (!alive) return;

        // who shares a spot with whom, and where in that spot's ring each of
        // them sits
        const bySpot = {};
        people.forEach((p) => (bySpot[spotKey(p)] ||= []).push(p.id));
        const seatOf = {};
        for (const ids of Object.values(bySpot)) {
          const seats = ringOffsets(ids.length);
          ids.forEach((id, i) => (seatOf[id] = seats[i]));
        }

        const bounds = new g.LatLngBounds();
        people.forEach((p, i) => {
          const pos = { lat: Number(p.lat), lng: Number(p.lng) };
          const icon = icons[i];
          const marker = new g.Marker({
            position: pos,
            map: map.current,
            title: p.city ? `${p.name} — ${p.city}` : p.name,
            // half the drawn size, anchored on the tip so the pin points at
            // the place rather than hovering above it
            ...(icon
              ? {
                  icon: {
                    url: icon,
                    scaledSize: new g.Size(PIN_W / 2, PIN_H / 2),
                    anchor: new g.Point(PIN_W / 4, PIN_H / 2),
                  },
                }
              : {}),
          });
          marker.addListener('click', () => open.current?.(p.id));
          // where she actually is, and where in the fan she's drawn
          marker.__base = pos;
          marker.__seat = seatOf[p.id];
          markers.current.push(marker);
          // the fit is done on the real places — the fan is a drawing trick and
          // shouldn't drag the viewport outward
          bounds.extend(pos);
        });

        // The fan is held in screen pixels, not degrees: a fixed offset in
        // degrees would be a mile apart at state level and invisible at street
        // level. Recomputing on every zoom keeps the spacing the same on the
        // glass wherever you are.
        const reseat = () => {
          const proj = map.current.getProjection();
          if (!proj) return;
          const scale = 2 ** map.current.getZoom();
          for (const m of markers.current) {
            const seat = m.__seat;
            if (!seat || (!seat.dx && !seat.dy)) continue;
            const world = proj.fromLatLngToPoint(new g.LatLng(m.__base.lat, m.__base.lng));
            m.setPosition(
              proj.fromPointToLatLng(
                new g.Point(world.x + seat.dx / scale, world.y + seat.dy / scale)
              )
            );
          }
        };
        // the projection doesn't exist until the map has drawn once, so seat
        // them on idle as well as on every zoom after that
        reseatListener.current?.forEach((l) => g.event.removeListener(l));
        reseatListener.current = [
          g.event.addListener(map.current, 'zoom_changed', reseat),
          g.event.addListener(map.current, 'idle', reseat),
        ];
        reseat();

        if (people.length === 1) {
          map.current.setCenter(bounds.getCenter());
          map.current.setZoom(11); // one pin has no extent to fit
        } else if (people.length > 1) {
          map.current.fitBounds(bounds, 48);
        }
      })
      .catch((e) => {
        if (!alive || e?.message === 'handled') return;
        // a real fault in the code above, said as such rather than blamed on Google
        console.error('[map]', e);
        setFailed(true);
        setWhy('Something went wrong drawing the map.');
      });

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
        {why ||
          'Check that Maps JavaScript API is enabled and that the key allows this site.'}
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
