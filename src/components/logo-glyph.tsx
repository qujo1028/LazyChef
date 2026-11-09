/**
 * LazyChef's mark: a lidded pot letting off a sleepy "z" of steam.
 * Plain SVG so both the UI and the generated app icons (next/og) can draw it.
 */
export const LOGO_COLORS = {
  green: "#2e7a4c",
  cream: "#fbf6ea",
  tomato: "#e2553b",
} as const

export function LogoGlyph({
  size,
  ink = LOGO_COLORS.cream,
  knob = LOGO_COLORS.tomato,
  className,
}: {
  size?: number | string
  ink?: string
  knob?: string
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Steam: a lazy "z" and a smaller one drifting up. */}
      <path d="M13.5 5.5h4.5l-4.5 4.5h4.5" stroke={ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20.5 2.5h2.6l-2.6 2.6h2.6" stroke={ink} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" opacity={0.75} />
      {/* Lid, knob and pot. */}
      <circle cx={16} cy={13.4} r={1.9} fill={knob} />
      <path d="M5.5 16.5h21" stroke={ink} strokeWidth={2.2} strokeLinecap="round" />
      <path d="M7 18.5h18v3.5a6 6 0 0 1-6 6h-6a6 6 0 0 1-6-6z" fill={ink} />
      <path d="M7 20.5H4.5M25 20.5h2.5" stroke={ink} strokeWidth={2.2} strokeLinecap="round" />
    </svg>
  )
}
