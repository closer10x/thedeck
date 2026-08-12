'use client';

import { useId } from 'react';

// One axe, drawn rather than imported — the same steel swings at a face, sits
// buried in it afterwards, and shrinks to the chip on her row.
//
// It comes two ways up. On its own it stands the way an axe stands when nobody
// is swinging it: head up and to the left, edge out, handle down the other
// way. `buried` turns it over — head down, edge first, handle in the air —
// which is the only place an axe points at the ground, and the pose Smash
// parks in the middle of a smashed photo.
export default function Axe({ size = 24, buried = false, style }) {
  // useId hands back colons, which are legal in an id and a menace inside
  // url(#…). Strip them, and keep the gradients per-instance so two axes on
  // screen don't share one definition.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const steel = `axe-steel-${uid}`;
  const wood = `axe-wood-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
      style={style}
    >
      <defs>
        {/* Lit from the top left, like everything else on these surfaces —
            and turned back by however far the drawing itself is turned, so
            the sheen stays at the top of the steel in both poses. The wood
            below is not counter-rotated: its gradient runs across the haft to
            round it off, and that has to turn with the haft. */}
        <linearGradient
          id={steel}
          x1="0.1"
          y1="0"
          x2="0.9"
          y2="1"
          gradientTransform={`rotate(${buried ? -28 : -131} 0.5 0.5)`}
        >
          <stop offset="0" stopColor="#EFF2F7" />
          <stop offset="0.45" stopColor="#C3C9D6" />
          <stop offset="1" stopColor="#7C8394" />
        </linearGradient>
        <linearGradient id={wood} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#D8A669" />
          <stop offset="0.5" stopColor="#A9713A" />
          <stop offset="1" stopColor="#734524" />
        </linearGradient>
      </defs>

      {/* The lean is baked in rather than left to whoever draws it: upright,
          the axe is a tall thin thing in the corner of a square box, and it has
          to fill the box on its own at the 13px the row chip draws it at.
          Buried is that lean alone. On its own it's the same lean turned
          through half a circle and then mirrored, which is the only way to get
          the head to the left with the edge still leading — rotating it there
          instead would leave the blade facing back down its own handle. The
          buried pose is untouched by any of that, so Smash still measures its
          bite point off a drawing that never moves. */}
      <g transform={buried ? 'rotate(28 50 50)' : 'translate(100 0) scale(-1 1) rotate(208 50 50)'}>
      {/* the haft, drawn first so the head covers it where the eye is */}
      <path
        d="M58 2 L67.5 3 L71 84 L61.5 85 Z"
        fill={`url(#${wood})`}
        stroke="rgba(40,24,10,0.45)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M62.6 8 L66 80" stroke="rgba(60,34,14,0.32)" strokeWidth="1.4" />

      {/* Head and poll in one silhouette. The flare is what makes it an axe
          rather than a hammer: the bit sweeps out to the left and the butt
          stays narrow on the right, and that asymmetry is still legible at
          the 13px the row chip draws it at. */}
      <path
        d="M74 72 L64 70 Q44 62 26 60 Q14 78 28 96 Q48 92 64 88 L74 86 Z"
        fill={`url(#${steel})`}
        stroke="rgba(14,14,26,0.45)"
        strokeWidth="1.4"
        strokeLinejoin="miter"
      />
      {/* the ground bevel along the cutting edge — the detail that says which
          end of it is sharp */}
      <path
        d="M29 66 Q19 78 31 92"
        stroke="rgba(255,255,255,0.7)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* the eye, where the haft comes through */}
      <path d="M64 70 L64 88" stroke="rgba(14,14,26,0.22)" strokeWidth="1.3" />
      </g>
    </svg>
  );
}
