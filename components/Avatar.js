'use client';

import { initials } from '../lib/format';

export default function Avatar({ name, url, size = 44 }) {
  const s = {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
    objectFit: 'cover',
    background: 'var(--accent-tint)',
    border: '1px solid #E9E8EF',
  };
  if (url) return <img src={url} alt="" style={s} />;
  return (
    <div
      style={{
        ...s,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--display), sans-serif',
        fontWeight: 600,
        fontSize: size * 0.36,
        color: 'var(--accent)',
        letterSpacing: '-0.02em',
      }}
    >
      {initials(name) || '?'}
    </div>
  );
}
