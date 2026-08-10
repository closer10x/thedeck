// Two fanned cards — the name is The Deck, so the mark is a deck. The back card
// tilts left, the front sits straight with a heart pip. Drawn rather than
// imported so the tilt and the pip stay under our control.
export default function Mark({ size = 18, strokeWidth = 1.6 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* the card behind, fanned out */}
      <rect x="3.2" y="5.6" width="10" height="14" rx="2.2" transform="rotate(-16 8.2 12.6)" />
      {/* the card in front */}
      <rect x="10.6" y="4.4" width="10.2" height="15.2" rx="2.4" />
      {/* pip */}
      <path d="M15.7 12.5c0-.9.75-1.5 1.5-1.1.75-.4 1.5.2 1.5 1.1 0 1-1.5 2-1.5 2s-1.5-1-1.5-2z" />
    </svg>
  );
}
