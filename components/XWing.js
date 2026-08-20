// The wingman's mark. An X-wing head-on: the hull in the middle, four foils
// locked in attack position, a cannon floating off the end of each. Drawn
// rather than imported because lucide has no starfighter, and filled rather
// than stroked because it's worn at 12px on a card — hairlines vanish at that
// size, a silhouette doesn't. The cannons are set off the wingtips with a gap;
// touching them turned the whole thing into a four-pointed star.
export default function XWing({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {/* the four foils, tapering out from the hull */}
      <path d="M10.4 12.2 5.4 7.2l1.8-1.8 5 5zM13.6 12.2l5-5-1.8-1.8-5 5zM10.4 11.8l-5 5 1.8 1.8 5-5zM13.6 11.8l5 5-1.8 1.8-5-5z" />
      {/* cannons, one off each wingtip */}
      <circle cx="3.4" cy="3.4" r="1.35" />
      <circle cx="20.6" cy="3.4" r="1.35" />
      <circle cx="3.4" cy="20.6" r="1.35" />
      <circle cx="20.6" cy="20.6" r="1.35" />
      {/* hull, nose forward */}
      <path d="M12 6.6c1.5 1.4 2.3 3.2 2.3 5.4s-.8 4-2.3 5.4c-1.5-1.4-2.3-3.2-2.3-5.4s.8-4 2.3-5.4z" />
    </svg>
  );
}
