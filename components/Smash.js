'use client';

import { useEffect, useRef, useState } from 'react';
import Axe from './Axe';

// How long the whole thing takes, and when the blade actually lands. The CSS
// keyframes in globals.css are keyed to the same two numbers — the swing's
// bite sits at 44% of its run, which is IMPACT_MS into PLAY_MS.
const PLAY_MS = 1250;

// Where the blade lands, in the overlay's own 100×100 space. The cracks
// radiate from here, the shards leave from here, and the axe is parked with
// its edge on it, so it's one number rather than three that have to agree.
const HIT = { x: 44, y: 41 };

// The axe, as a square, sized in percent of whatever it's smashing. Its bite
// point — mid cutting edge, at (8.6%, 60%) of that square once the drawing's
// own lean is taken into account — is both where it gets parked over HIT and
// what it pivots around, so the swing traces an arc around the edge rather
// than around the middle of the drawing.
const AXE = { size: 76, biteX: 8.6, biteY: 60 };

// Fractures radiating from the hit, each with a kink in it — a crack that
// travels in a straight line reads as a drawn line, not as broken glass.
const CRACKS = [
  'M44 41 L28 22 L21 6',
  'M44 41 L64 27 L79 18',
  'M44 41 L72 48 L94 44',
  'M44 41 L57 66 L54 92',
  'M44 41 L26 58 L6 62',
  'M44 41 L34 74 L19 93',
];

// the short splinters off the main breaks
const BRANCHES = ['M28 22 L15 26', 'M64 27 L67 13', 'M57 66 L73 73', 'M26 58 L21 45', 'M34 74 L45 85'];

// Pieces that leave. `l`/`t`/`s` place and size each one over the face in
// percent; `dx`/`dy` are percentages of the shard's own box, so one keyframe
// throws all six in different directions.
const SHARDS = [
  { l: 30, t: 24, s: 24, dx: -120, dy: -84, rot: -46, clip: '50% 0%, 100% 88%, 0% 70%' },
  { l: 47, t: 19, s: 20, dx: 92, dy: -116, rot: 52, clip: '0% 0%, 100% 30%, 40% 100%' },
  { l: 52, t: 38, s: 26, dx: 132, dy: -22, rot: 38, clip: '0% 20%, 100% 0%, 76% 100%' },
  { l: 43, t: 51, s: 22, dx: 58, dy: 124, rot: -30, clip: '0% 0%, 100% 40%, 30% 100%' },
  { l: 25, t: 46, s: 24, dx: -114, dy: 72, rot: -58, clip: '100% 0%, 80% 100%, 0% 46%' },
  { l: 35, t: 33, s: 18, dx: -18, dy: -142, rot: 24, clip: '50% 0%, 100% 100%, 0% 100%' },
];

// Wraps a face and takes an axe to it.
//
// `axed` is the state, not the event: a person who was already axed when the
// list loaded shows up broken with no animation, because replaying every smash
// on every refresh would turn the roster into a woodshed. The swing plays on
// the edge — the moment she becomes axed while you're looking — or when
// `replay` is raised, which is how the row catches up on a smash that happened
// behind the open sheet.
//
// `src` is her photo, and it's what the flying pieces are made of: each shard
// carries its own crop of the same image, so what leaves the frame is her face
// rather than six grey triangles.
export default function Smash({ axed, replay = false, src, size, radius = '50%', children }) {
  const [playing, setPlaying] = useState(false);
  const wasAxed = useRef(!!axed);
  const wasReplay = useRef(!!replay);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    const struck = !!axed && !wasAxed.current;
    const asked = !!axed && !!replay && !wasReplay.current;
    wasAxed.current = !!axed;
    wasReplay.current = !!replay;
    if (!struck && !asked) return;

    // Reduced motion gets the aftermath and none of the swing. The stylesheet
    // already kills every animation, but starting one anyway would leave the
    // shards frozen mid-air over her face until the timer cleared them.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    setPlaying(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setPlaying(false), PLAY_MS);
  }, [axed, replay]);

  const box = size ?? '100%';

  return (
    <span
      className={playing ? 'smash-jolt' : undefined}
      style={{
        position: 'relative',
        display: 'inline-flex',
        width: box,
        height: box,
        flexShrink: 0,
        verticalAlign: 'top',
      }}
    >
      {children}

      {axed && (
        <>
          {/* The breakage is clipped to the face — cracks that ran off the
              edge of a photo would just be lines on the card. */}
          <span
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: radius,
              overflow: 'hidden',
              pointerEvents: 'none',
            }}
          >
            <svg
              className={playing ? 'smash-cracks smash-play' : 'smash-cracks'}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              style={{ display: 'block', width: '100%', height: '100%' }}
            >
              {/* the bruise around the point of impact, so the glass looks
                  struck rather than merely drawn on */}
              <circle
                className="smash-bruise"
                cx={HIT.x}
                cy={HIT.y}
                r="15"
                fill="rgba(12,10,22,0.34)"
                style={{ filter: 'blur(6px)' }}
              />
              {/* two passes: a dark break with a lit lip just off it. One
                  colour alone disappears into either a bright photo or a dark
                  one, and the offset is what gives the crack a depth. */}
              <g
                transform="translate(0.9 0.9)"
                stroke="rgba(255,255,255,0.62)"
                strokeWidth="1.5"
                strokeLinecap="round"
                fill="none"
              >
                {CRACKS.concat(BRANCHES).map((d, i) => (
                  <path key={i} d={d} pathLength="100" />
                ))}
              </g>
              <g
                stroke="rgba(10,8,20,0.66)"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              >
                {CRACKS.map((d, i) => (
                  <path key={i} d={d} pathLength="100" />
                ))}
                {BRANCHES.map((d, i) => (
                  <path key={i} d={d} strokeWidth="1.4" pathLength="100" />
                ))}
              </g>
            </svg>
          </span>

          {/* Everything that leaves the frame lives outside the clip: the
              pieces fly past the edge, and the handle sticks out of it. */}
          {playing && (
            <span style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              <span
                className="smash-flash"
                style={{
                  position: 'absolute',
                  left: `${HIT.x - 30}%`,
                  top: `${HIT.y - 30}%`,
                  width: '60%',
                  height: '60%',
                  borderRadius: '50%',
                  background:
                    'radial-gradient(circle, rgba(255,255,255,0.95), rgba(255,255,255,0) 68%)',
                }}
              />
              {SHARDS.map((s, i) => (
                <span
                  key={i}
                  className="smash-shard"
                  style={{
                    position: 'absolute',
                    left: `${s.l}%`,
                    top: `${s.t}%`,
                    width: `${s.s}%`,
                    height: `${s.s}%`,
                    // the shadow has to be on the piece that moves and the
                    // clip on the one inside it: a filter and a clip-path on
                    // one element clips the shadow away with everything else
                    filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.45))',
                    '--smash-dx': `${s.dx}%`,
                    '--smash-dy': `${s.dy}%`,
                    '--smash-rot': `${s.rot}deg`,
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      inset: 0,
                      overflow: 'hidden',
                      clipPath: `polygon(${s.clip})`,
                      background: src ? 'transparent' : 'var(--accent-tint)',
                    }}
                  >
                    {src && (
                      // the same crop she already had, so the piece that flies
                      // off is the piece that was there
                      <img
                        src={src}
                        alt=""
                        style={{
                          position: 'absolute',
                          left: `${(-s.l / s.s) * 100}%`,
                          top: `${(-s.t / s.s) * 100}%`,
                          width: `${(100 / s.s) * 100}%`,
                          height: `${(100 / s.s) * 100}%`,
                          objectFit: 'cover',
                        }}
                      />
                    )}
                  </span>
                </span>
              ))}
            </span>
          )}

          {/* The axe itself. The outer span is where it comes to rest — edge
              on the hit, handle out the top right — and the inner one is the
              swing that arrives there, so the animation ends exactly on the
              pose the picture keeps afterwards. */}
          <span
            style={{
              position: 'absolute',
              left: `${HIT.x - (AXE.biteX / 100) * AXE.size}%`,
              top: `${HIT.y - (AXE.biteY / 100) * AXE.size}%`,
              width: `${AXE.size}%`,
              height: `${AXE.size}%`,
              transformOrigin: `${AXE.biteX}% ${AXE.biteY}%`,
              pointerEvents: 'none',
              filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.45))',
            }}
          >
            <span
              className={playing ? 'smash-chop' : undefined}
              style={{
                display: 'block',
                width: '100%',
                height: '100%',
                transformOrigin: `${AXE.biteX}% ${AXE.biteY}%`,
              }}
            >
              <Axe size="100%" buried />
            </span>
          </span>
        </>
      )}
    </span>
  );
}
