// A small bar chart in plain SVG (no chart library). Server-safe: it has no state or handlers.

const WIDTH = 600
const HEIGHT = 160
const PLOT_TOP = 10
const PLOT_BOTTOM = 140
const PLOT_HEIGHT = PLOT_BOTTOM - PLOT_TOP
const LABEL_Y = 156

export type UsageBar = { label: string; value: number; flag?: boolean }

/**
 * Bars for one value per day (or per item), with an optional dashed limit line. `flag` bars
 * use the destructive colour and the sentence summary says so, so colour is not the only signal.
 */
export function UsageBarChart({
  data,
  limit,
  unit,
  title,
}: {
  data: UsageBar[]
  limit?: number
  unit: string
  title: string
}) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No data yet.</p>
  }

  const values = data.map((d) => d.value)
  const max = Math.max(limit ?? 0, ...values, 1)
  const peak = data.reduce((best, d) => (d.value > best.value ? d : best), data[0])
  const flagged = data.filter((d) => d.flag).length
  const slot = WIDTH / data.length
  const barWidth = Math.max(slot * 0.7, 1)
  const toY = (value: number) => PLOT_BOTTOM - (Math.max(value, 0) / max) * PLOT_HEIGHT

  const normal = data.map((d, i) => ({ d, i })).filter(({ d }) => !d.flag)
  const flaggedBars = data.map((d, i) => ({ d, i })).filter(({ d }) => d.flag)

  // Label the first, middle and last item only, so the axis stays readable at 320 px.
  const labelIndexes = [...new Set([0, Math.floor((data.length - 1) / 2), data.length - 1])]

  const summary =
    `${title}. Highest ${peak.value} ${unit} on ${peak.label}.` +
    (flagged > 0 ? ` ${flagged} ${flagged === 1 ? "day" : "days"} hit the limit.` : "")

  const barRect = ({ d, i }: { d: UsageBar; i: number }) => (
    <rect
      key={`${d.label}-${i}`}
      x={i * slot + (slot - barWidth) / 2}
      y={toY(d.value)}
      width={barWidth}
      height={Math.max(PLOT_BOTTOM - toY(d.value), 0)}
      fill="currentColor"
    >
      <title>{`${d.label}: ${d.value} ${unit}`}</title>
    </rect>
  )

  return (
    <figure className="m-0 grid gap-1">
      <figcaption className="sr-only">{summary}</figcaption>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full" role="img" aria-label={title}>
        <g className="text-primary">{normal.map(barRect)}</g>
        <g className="text-destructive">{flaggedBars.map(barRect)}</g>
        {limit !== undefined ? (
          <g className="text-xs text-muted-foreground">
            <line
              x1={0}
              x2={WIDTH}
              y1={toY(limit)}
              y2={toY(limit)}
              stroke="currentColor"
              strokeDasharray="4 4"
              strokeWidth={1}
            />
            <text x={WIDTH} y={toY(limit) - 4} textAnchor="end" fill="currentColor">
              {`${limit} limit`}
            </text>
          </g>
        ) : null}
        <g className="text-xs text-muted-foreground">
          {labelIndexes.map((i) => {
            const anchor = i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"
            const x = anchor === "start" ? 0 : anchor === "end" ? WIDTH : i * slot + slot / 2
            return (
              <text key={i} x={x} y={LABEL_Y} textAnchor={anchor} fill="currentColor">
                {data[i].label}
              </text>
            )
          })}
        </g>
      </svg>
    </figure>
  )
}
