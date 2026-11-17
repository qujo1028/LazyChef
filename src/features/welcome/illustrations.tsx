// The tour's four pictures (Figma: Components → Illustration/*). Drawn with the theme's
// colors, so they follow light and dark mode. Decorative: the card text says the same.

const svg = { viewBox: "0 0 320 240", fill: "none", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": true } as const

export function PantryIllustration({ className }: { className?: string }) {
  return (
    <svg {...svg} className={className}>
      <rect x="40" y="56" width="240" height="168" rx="16" className="fill-card stroke-border" strokeWidth="2" />
      <rect x="41" y="136" width="238" height="4" className="fill-border" />
      <rect x="64" y="84" width="36" height="52" rx="8" className="fill-primary" />
      <rect x="60" y="76" width="44" height="12" rx="4" className="fill-foreground" />
      <rect x="114" y="96" width="32" height="40" rx="8" className="fill-chart-3" />
      <rect x="111" y="89" width="38" height="10" rx="4" className="fill-foreground" />
      <rect x="160" y="78" width="44" height="58" rx="6" className="fill-tomato" />
      <rect x="168" y="92" width="28" height="16" rx="3" className="fill-card" />
      <rect x="221" y="86" width="22" height="50" rx="8" className="fill-primary" />
      <rect x="227" y="72" width="10" height="18" rx="3" className="fill-primary" />
      <rect x="60" y="188" width="72" height="28" rx="8" className="fill-secondary stroke-border" strokeWidth="2" />
      {[76, 96, 116].map((cx) => (
        <ellipse key={cx} cx={cx} cy="184" rx="9" ry="11" className="fill-card stroke-border" strokeWidth="2" />
      ))}
      <circle cx="164" cy="198" r="17" className="fill-tomato" />
      <path d="M164 181c2-7 9-9 13-9-1 7-7 10-13 9z" className="fill-primary" />
      <rect x="200" y="168" width="44" height="48" rx="6" className="fill-chart-3" />
      <rect x="200" y="182" width="44" height="18" className="fill-card" />
      {[
        [224, "fill-primary"],
        [252, "fill-tomato"],
        [280, "fill-chart-3"],
      ].map(([cx, fill]) => (
        <g key={cx}>
          <circle cx={cx} cy="40" r="18" className={`${fill} stroke-secondary`} strokeWidth="4" />
          <circle cx={cx} cy="36" r="6" className="fill-primary-foreground" />
          <path d={`M${Number(cx) - 10} 52a10 8 0 0 1 20 0`} className="fill-primary-foreground" />
        </g>
      ))}
    </svg>
  )
}

export function ScanIllustration({ className }: { className?: string }) {
  return (
    <svg {...svg} className={className}>
      <rect x="100" y="12" width="120" height="220" rx="24" className="fill-foreground" />
      <rect x="108" y="20" width="104" height="204" rx="18" className="fill-card" />
      <path
        d="M126 72v-10a6 6 0 0 1 6-6h10M178 56h10a6 6 0 0 1 6 6v10M194 146v10a6 6 0 0 1-6 6h-10M142 162h-10a6 6 0 0 1-6-6v-10"
        className="stroke-primary"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {[
        [136, 4],
        [144, 2],
        [150, 6],
        [160, 2],
        [166, 4],
        [174, 2],
        [180, 4],
      ].map(([x, w]) => (
        <rect key={x} x={x} y="86" width={w} height="48" className="fill-foreground" />
      ))}
      <rect x="128" y="108" width="64" height="3" rx="1.5" className="fill-tomato motion-safe:animate-pulse" />
      <rect x="164" y="170" width="140" height="52" rx="14" className="fill-card stroke-border" strokeWidth="2" />
      <circle cx="188" cy="196" r="12" className="fill-primary" />
      <path d="M182 196l4 4 8-8" className="stroke-primary-foreground" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="208" y="186" width="64" height="8" rx="4" className="fill-foreground" />
      <rect x="208" y="200" width="44" height="6" rx="3" className="fill-muted-foreground" />
      <rect x="16" y="48" width="104" height="44" rx="14" className="fill-card stroke-border" strokeWidth="2" />
      <circle cx="38" cy="70" r="8" className="fill-tomato" />
      <rect x="54" y="62" width="48" height="7" rx="3.5" className="fill-foreground" />
      <rect x="54" y="74" width="32" height="6" rx="3" className="fill-muted-foreground" />
    </svg>
  )
}

export function ListIllustration({ className }: { className?: string }) {
  const rows = [
    { y: 68, done: true, w: 80, dot: "fill-tomato" },
    { y: 108, done: true, w: 60, dot: "fill-chart-3" },
    { y: 148, done: false, w: 96, dot: "fill-primary" },
    { y: 188, done: false, w: 70, dot: "fill-tomato" },
  ]
  return (
    <svg {...svg} className={className}>
      <rect x="40" y="16" width="200" height="208" rx="16" className="fill-card stroke-border" strokeWidth="2" />
      <rect x="60" y="36" width="88" height="10" rx="5" className="fill-foreground" />
      {rows.map((row) => (
        <g key={row.y}>
          {row.done ? (
            <>
              <rect x="60" y={row.y} width="20" height="20" rx="6" className="fill-primary" />
              <path
                d={`M65 ${row.y + 10}l3.5 3.5 6.5-7`}
                className="stroke-primary-foreground"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          ) : (
            <rect x="61" y={row.y + 1} width="18" height="18" rx="5" className="fill-card stroke-border" strokeWidth="2" />
          )}
          <rect
            x="92"
            y={row.y + 6}
            width={row.w}
            height="8"
            rx="4"
            className={row.done ? "fill-muted-foreground" : "fill-foreground"}
            opacity={row.done ? 0.6 : 1}
          />
          <circle cx="216" cy={row.y + 10} r="8" className={row.dot} />
        </g>
      ))}
      <path d="M232 78c40 0 56 30 52 76" className="stroke-primary" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 8" />
      <path d="M276 146l8 10 8-10" className="stroke-primary" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="266" y="172" width="38" height="48" rx="9" className="fill-chart-3" />
      <rect x="262" y="164" width="46" height="12" rx="4" className="fill-foreground" />
    </svg>
  )
}

export function CookIllustration({ className }: { className?: string }) {
  return (
    <svg {...svg} className={className}>
      <path d="M80 52h22l-22 22h22" className="stroke-muted-foreground" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M114 24h13l-13 13h13" className="stroke-muted-foreground" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
      <circle cx="92" cy="104" r="9" className="fill-tomato" />
      <rect x="24" y="116" width="136" height="11" rx="5.5" className="fill-foreground" />
      <path d="M32 136h120v34a34 34 0 0 1-34 34H66a34 34 0 0 1-34-34z" className="fill-primary" />
      <rect x="12" y="144" width="24" height="10" rx="5" className="fill-foreground" />
      <rect x="148" y="144" width="24" height="10" rx="5" className="fill-foreground" />
      <rect x="176" y="28" width="132" height="180" rx="16" className="fill-card stroke-border" strokeWidth="2" />
      <path d="M177 44a15 15 0 0 1 15-15h100a15 15 0 0 1 15 15v49H177z" className="fill-chart-3" />
      <circle cx="222" cy="62" r="18" className="fill-tomato" />
      <circle cx="256" cy="56" r="12" className="fill-primary" />
      <circle cx="270" cy="72" r="9" className="fill-card" />
      <rect x="192" y="108" width="96" height="9" rx="4.5" className="fill-foreground" />
      <rect x="192" y="124" width="64" height="7" rx="3.5" className="fill-muted-foreground" />
      <rect x="192" y="146" width="100" height="8" rx="4" className="fill-muted" />
      <rect x="192" y="146" width="75" height="8" rx="4" className="fill-primary" />
      <rect x="192" y="170" width="44" height="22" rx="11" className="fill-primary" />
      <rect x="204" y="178" width="20" height="6" rx="3" className="fill-primary-foreground" />
      <rect x="244" y="170" width="48" height="22" rx="11" className="fill-secondary stroke-border" strokeWidth="2" />
      <rect x="256" y="178" width="24" height="6" rx="3" className="fill-muted-foreground" />
    </svg>
  )
}
