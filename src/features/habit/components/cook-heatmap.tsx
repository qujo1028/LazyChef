import { cn } from "@/lib/utils"

import type { Heatmap, HeatmapCell } from "../heatmap"

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const
/** Only these rows get a visible label; the rest are named for screen readers. */
const VISIBLE_LABELS = new Set([0, 2, 4])

const LEVEL_CLASS: Record<HeatmapCell["level"], string> = {
  0: "bg-muted",
  1: "bg-primary/35",
  2: "bg-primary/65",
  3: "bg-primary",
}

function cellLabel(cell: HeatmapCell) {
  const date = new Date(`${cell.day}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
  if (cell.future) return `${date}: upcoming`
  if (cell.cooks === 0) return `${date}: no cook`
  return `${date}: ${cell.cooks === 1 ? "1 meal cooked" : `${cell.cooks} meals cooked`}`
}

/** 16 weeks of cook days, one row per weekday (Monday first), newest week on the right. */
export function CookHeatmap({ heatmap }: { heatmap: Heatmap }) {
  const { weeks, cookDaysLast28 } = heatmap
  return (
    <figure className="grid gap-3 rounded-xl border bg-card p-3.5">
      <figcaption className="text-sm text-muted-foreground">
        Cooked on {cookDaysLast28} of the last 28 days
      </figcaption>
      <div role="grid" aria-label={`Cook calendar, last ${weeks.length} weeks`} className="grid gap-1">
        {WEEKDAYS.map((weekday, row) => (
          <div key={weekday} role="row" className="flex items-center gap-1">
            <span
              role="rowheader"
              className={cn("w-7 shrink-0 text-[10px] leading-none text-muted-foreground", !VISIBLE_LABELS.has(row) && "sr-only")}
            >
              {weekday}
            </span>
            {weeks.map((week) => {
              const cell = week[row]
              const label = cellLabel(cell)
              return (
                <span
                  key={cell.day}
                  role="gridcell"
                  aria-label={label}
                  title={label}
                  className={cn(
                    "aspect-square min-w-0 flex-1 rounded-[3px]",
                    LEVEL_CLASS[cell.level],
                    cell.future && "bg-transparent outline outline-1 -outline-offset-1 outline-border/60",
                  )}
                />
              )
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground" aria-hidden>
        <span>Fewer</span>
        {([0, 1, 2, 3] as const).map((level) => (
          <span key={level} className={cn("size-2.5 rounded-[3px]", LEVEL_CLASS[level])} />
        ))}
        <span>More</span>
      </div>
    </figure>
  )
}
