'use client';

import { initials } from '../lib/format';

// Instagram's story ring, in its own colours. Worth borrowing rather than
// inventing: everyone already reads this exact gradient as "there's an
// Instagram behind this face", so it needs no legend.
const IG_RING =
  'conic-gradient(from 215deg, #FEDA75, #FA7E1E, #D62976, #962FBF, #4F5BD5, #FEDA75)';

const RING = 2; // the gradient itself
const GAP = 2; // the breath between gradient and photo, as Instagram has it

// `ring` marks a linked Instagram. The ring is drawn *inside* the size asked
// for rather than around it, so turning it on doesn't reflow the row — a list
// where some faces are bigger than others because of a property they happen to
// have reads as a bug.
export default function Avatar({ name, url, size = 44, ring = false }) {
  const inner = ring ? size - (RING + GAP) * 2 : size;

  const s = {
    width: inner,
    height: inner,
    borderRadius: '50%',
    flexShrink: 0,
    objectFit: 'cover',
    background: 'var(--accent-tint)',
    border: ring ? 'none' : '1px solid var(--line)',
  };

  const face = url ? (
    <img src={url} alt="" style={s} />
  ) : (
    <div
      style={{
        ...s,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--display), sans-serif',
        fontWeight: 600,
        fontSize: inner * 0.36,
        color: 'var(--accent)',
        letterSpacing: '-0.02em',
      }}
    >
      {initials(name) || '?'}
    </div>
  );

  if (!ring) return face;

  return (
    <span
      title="On Instagram"
      style={{
        display: 'inline-flex',
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: '50%',
        padding: RING,
        background: IG_RING,
      }}
    >
      {/* the gap is the page showing through, so it works on any surface */}
      <span
        style={{
          display: 'flex',
          padding: GAP,
          borderRadius: '50%',
          background: 'var(--surface)',
        }}
      >
        {face}
      </span>
    </span>
  );
}
