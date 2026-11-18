import { formatCount } from "@/features/admin/components/stat-tile"
import type { Popular, PopularList } from "@/features/admin/insights"

const LISTS: { key: PopularList; title: string; unit: string }[] = [
  { key: "cooked", title: "Most cooked", unit: "times" },
  { key: "saved", title: "Most saved", unit: "saves" },
  { key: "rated_up", title: "Top rated", unit: "thumbs up" },
  { key: "rated_down", title: "Lowest rated", unit: "thumbs down" },
  { key: "pantry", title: "Most common pantry items", unit: "households" },
  { key: "wasted", title: "Most often thrown out", unit: "times" },
]

/** Six short ranked lists. */
export function PopularLists({ popular }: { popular: Popular }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {LISTS.map(({ key, title, unit }) => (
        <section key={key} aria-labelledby={`popular-${key}`} className="min-w-0 rounded-lg border p-3">
          <h3 id={`popular-${key}`} className="mb-2 text-sm font-medium">
            {title}
          </h3>
          {popular[key].length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing yet</p>
          ) : (
            <ol className="grid gap-1 text-sm">
              {popular[key].map((item, i) => (
                <li key={`${item.name}-${i}`} className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate">
                    <span className="mr-1.5 tabular-nums text-muted-foreground">{i + 1}.</span>
                    {item.name}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground" title={`${formatCount(item.n)} ${unit}`}>
                    {formatCount(item.n)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      ))}
    </div>
  )
}
