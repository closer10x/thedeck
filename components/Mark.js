// The Venus glyph, drawn rather than imported — lucide has no `Venus` at this
// version, and two shapes is simpler than any icon in the set.
export default function Mark({ size = 18, strokeWidth = 2 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="8.5" r="5.5" />
      <path d="M12 14v7" />
      <path d="M8.5 18h7" />
    </svg>
  );
}
