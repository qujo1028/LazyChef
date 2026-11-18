import { Legend, SERIES_COLORS } from "@/features/admin/components/trend-chart"

export type BarColumn = {
  label: string
  segments: { key: string; value: number }[]
}

export type BarSeries = { key: string; label: string; color: number }

const W = 360
const H = 160
const PAD = { left: 34, right: 6, top: 8, bottom: 20 }

function niceMax(max: number): number {
  if (max <= 0) return 1
  const pow = 10 ** Math.floor(Math.log10(max))
  const n = max / pow
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow
}

/** Bars per column, stacked by series with a 1.5 px gap. One series makes a plain bar chart. */
export function StackedBars({
  title,
  columns,
  series,
  format = (n) => String(n),
}: {
  title: string
  columns: BarColumn[]
  series: BarSeries[]
  format?: (n: number) => string
}) {
  const totals = columns.map((c) => c.segments.reduce((s, x) => s + x.value, 0))
  const max = niceMax(Math.max(0, ...totals))
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const slot = columns.length ? innerW / columns.length : innerW
  const barW = Math.max(Math.min(slot * 0.7, 24), 2)
  const grand = totals.reduce((a, b) => a + b, 0)
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH
  const summary = `${columns.length} columns, ${format(grand)} in total, from ${columns[0]?.label ?? "n/a"} to ${columns[columns.length - 1]?.label ?? "n/a"}.`

  return (
    <figure className="grid min-w-0 gap-2">
      <figcaption className="text-sm font-medium">{title}</figcaption>
      {series.length > 1 ? <Legend items={series.map((s) => ({ label: s.label, color: s.color }))} /> : null}
      {grand > 0 ? (
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${title}. ${summary}`}>
          {[0, 0.5, 1].map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(max * t)} y2={y(max * t)} className="stroke-border" strokeWidth={1} />
              <text x={PAD.left - 4} y={y(max * t) + 3} textAnchor="end" className="fill-muted-foreground" fontSize={9}>
                {format(max * t)}
              </text>
            </g>
          ))}
          {columns.map((col, i) => {
            const cx = PAD.left + slot * i + (slot - barW) / 2
            let acc = 0
            const tip = `${col.label}\n${col.segments.map((s) => `${series.find((x) => x.key === s.key)?.label ?? s.key}: ${format(s.value)}`).join("\n")}`
            return (
              <g key={col.label}>
                <title>{tip}</title>
                {col.segments.map((s) => {
                  if (s.value <= 0) return null
                  const top = y(acc + s.value)
                  const bottom = y(acc)
                  acc += s.value
                  const color = SERIES_COLORS[series.find((x) => x.key === s.key)?.color ?? 0]
                  return (
                    <rect key={s.key} x={cx} y={top} width={barW} height={Math.max(bottom - top - 1.5, 1)} rx={1.5} className={color.fill} />
                  )
                })}
              </g>
            )
          })}
          <text x={PAD.left} y={H - 5} className="fill-muted-foreground" fontSize={9}>
            {columns[0]?.label}
          </text>
          <text x={W - PAD.right} y={H - 5} textAnchor="end" className="fill-muted-foreground" fontSize={9}>
            {columns[columns.length - 1]?.label}
          </text>
        </svg>
      ) : (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">Nothing recorded yet.</p>
      )}
    </figure>
  )
}
