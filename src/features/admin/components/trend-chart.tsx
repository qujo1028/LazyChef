import { cn } from "@/lib/utils"
import { shortDay } from "@/features/admin/overview-format"

/** Categorical colours in fixed order (never cycled). Full class names so Tailwind keeps them. */
export const SERIES_COLORS = [
  { stroke: "stroke-sky-600 dark:stroke-sky-400", fill: "fill-sky-600 dark:fill-sky-400", bg: "bg-sky-600 dark:bg-sky-400" },
  { stroke: "stroke-orange-600 dark:stroke-orange-400", fill: "fill-orange-600 dark:fill-orange-400", bg: "bg-orange-600 dark:bg-orange-400" },
  { stroke: "stroke-emerald-600 dark:stroke-emerald-400", fill: "fill-emerald-600 dark:fill-emerald-400", bg: "bg-emerald-600 dark:bg-emerald-400" },
  { stroke: "stroke-violet-600 dark:stroke-violet-400", fill: "fill-violet-600 dark:fill-violet-400", bg: "bg-violet-600 dark:bg-violet-400" },
  { stroke: "stroke-rose-600 dark:stroke-rose-400", fill: "fill-rose-600 dark:fill-rose-400", bg: "bg-rose-600 dark:bg-rose-400" },
  { stroke: "stroke-amber-500 dark:stroke-amber-300", fill: "fill-amber-500 dark:fill-amber-300", bg: "bg-amber-500 dark:bg-amber-300" },
  { stroke: "stroke-slate-500 dark:stroke-slate-400", fill: "fill-slate-500 dark:fill-slate-400", bg: "bg-slate-500 dark:bg-slate-400" },
] as const

export type TrendSeries = {
  name: string
  /** One value per day; null is a gap. */
  values: (number | null)[]
  /** Index into SERIES_COLORS. */
  color: number
  /** Draw as a dashed line (for a total over the parts). */
  dashed?: boolean
}

const W = 360
const H = 150
const PAD = { left: 34, right: 8, top: 8, bottom: 20 }

function niceMax(max: number): number {
  if (max <= 0) return 1
  const pow = 10 ** Math.floor(Math.log10(max))
  const n = max / pow
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow
}

export function Legend({ items }: { items: { label: string; color: number; dashed?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span aria-hidden className={cn("inline-block h-2.5 w-2.5 rounded-sm", SERIES_COLORS[item.color].bg)} />
          {item.label}
          {item.dashed ? " (dashed)" : ""}
        </li>
      ))}
    </ul>
  )
}

/**
 * A small line chart over days. Gaps (null) break the line. One y-scale. Each day has a hover
 * title listing its values; a text summary is for screen readers.
 */
export function TrendChart({
  title,
  days,
  series,
  format = (n) => String(n),
  note,
}: {
  title: string
  days: string[]
  series: TrendSeries[]
  format?: (n: number) => string
  note?: string
}) {
  const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null)
  const hasData = all.length > 0
  const max = niceMax(Math.max(0, ...all))
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (days.length <= 1 ? innerW / 2 : (i / (days.length - 1)) * innerW)
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH

  const summary = hasData
    ? series
        .map((s) => {
          const vals = s.values.filter((v): v is number => v !== null)
          return vals.length ? `${s.name}: latest ${format(vals[vals.length - 1])}, peak ${format(Math.max(...vals))}` : `${s.name}: no data`
        })
        .join(". ")
    : "No data yet."

  return (
    <figure className="grid min-w-0 gap-2">
      <figcaption className="text-sm font-medium">{title}</figcaption>
      {series.length > 1 ? <Legend items={series.map((s) => ({ label: s.name, color: s.color, dashed: s.dashed }))} /> : null}
      {hasData ? (
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${title}. ${summary}`}>
          {[0, 0.5, 1].map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(max * t)} y2={y(max * t)} className="stroke-border" strokeWidth={1} />
              <text x={PAD.left - 4} y={y(max * t) + 3} textAnchor="end" className="fill-muted-foreground" fontSize={9}>
                {format(max * t)}
              </text>
            </g>
          ))}
          <text x={PAD.left} y={H - 5} className="fill-muted-foreground" fontSize={9}>
            {shortDay(days[0])}
          </text>
          <text x={W - PAD.right} y={H - 5} textAnchor="end" className="fill-muted-foreground" fontSize={9}>
            {shortDay(days[days.length - 1])}
          </text>
          {series.map((s) => {
            const c = SERIES_COLORS[s.color]
            const segments: string[] = []
            let current: string[] = []
            const points: { i: number; v: number }[] = []
            s.values.forEach((v, i) => {
              if (v === null) {
                if (current.length) segments.push(current.join(" "))
                current = []
              } else {
                current.push(`${current.length ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
                points.push({ i, v })
              }
            })
            if (current.length) segments.push(current.join(" "))
            const showDots = points.length <= 40
            return (
              <g key={s.name}>
                {segments.map((d, k) => (
                  <path key={k} d={d} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? "4 3" : undefined} className={c.stroke} />
                ))}
                {showDots
                  ? points.map((p) => <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={2.5} className={cn(c.fill, "stroke-card")} strokeWidth={1.5} />)
                  : null}
              </g>
            )
          })}
          {days.map((d, i) => {
            const step = days.length <= 1 ? innerW : innerW / (days.length - 1)
            const lines = series.map((s) => `${s.name}: ${s.values[i] === null ? "no data" : format(s.values[i] as number)}`)
            return (
              <rect key={d} x={x(i) - step / 2} y={PAD.top} width={step} height={innerH} fill="transparent">
                <title>{`${shortDay(d)}\n${lines.join("\n")}`}</title>
              </rect>
            )
          })}
        </svg>
      ) : (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">Nothing recorded yet.</p>
      )}
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    </figure>
  )
}
