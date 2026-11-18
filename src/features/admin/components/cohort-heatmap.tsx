import type { RetentionCohort } from "@/features/admin/insights"
import { cohortPercents, shortDay } from "@/features/admin/overview-format"

const WEEKS = 8

/** Rows are sign-up weeks; cells are % of the cohort active. The number is always shown. */
export function CohortHeatmap({ cohorts }: { cohorts: RetentionCohort[] }) {
  return (
    <figure className="grid gap-2">
      <figcaption className="text-xs text-muted-foreground">
        Share of each sign-up week that was active in the weeks after. Darker is higher. Blank means that week hasn&apos;t happened yet.
      </figcaption>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-separate border-spacing-0.5 text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th scope="col" className="px-2 py-1 text-left font-normal">
                Signed up (week of)
              </th>
              <th scope="col" className="px-2 py-1 text-right font-normal">
                People
              </th>
              {Array.from({ length: WEEKS }, (_, n) => (
                <th key={n} scope="col" className="px-1 py-1 text-center font-normal">
                  Wk {n}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cohorts.map((c) => (
              <tr key={c.cohortWeek}>
                <th scope="row" className="whitespace-nowrap px-2 py-1 text-left font-normal">
                  {shortDay(c.cohortWeek)}
                </th>
                <td className="px-2 py-1 text-right tabular-nums">{c.size}</td>
                {cohortPercents(c, WEEKS).map((p, n) => (
                  <td
                    key={n}
                    title={p === null ? "Not yet" : `Week ${n}: ${Math.round(p * 100)}% active`}
                    className="relative overflow-hidden rounded text-center tabular-nums"
                  >
                    {p !== null ? (
                      <span aria-hidden className="absolute inset-0 bg-primary" style={{ opacity: Math.max(p, 0.04) * 0.85 }} />
                    ) : null}
                    <span className="relative block px-1 py-1 font-medium">{p === null ? "" : `${Math.round(p * 100)}%`}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}
