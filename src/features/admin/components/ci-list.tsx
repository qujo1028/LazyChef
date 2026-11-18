import type { CiItem } from "@/features/admin/github-deploys"
import { StatusDot, type HealthState } from "@/features/admin/components/status-dot"

const CI_STYLE: Record<CiItem["state"], { state: HealthState; label: string }> = {
  success: { state: "ok", label: "Passed" },
  failure: { state: "down", label: "Failed" },
  pending: { state: "warn", label: "Running" },
  neutral: { state: "off", label: "Neutral" },
  skipped: { state: "off", label: "Skipped" },
}

/** CI results for the latest commit on main. Names link to their run or status page. */
export function CiList({
  sha,
  items,
  checksUnavailable,
}: {
  sha: string
  items: CiItem[]
  checksUnavailable: boolean
}) {
  return (
    <div className="grid gap-3">
      <p className="text-xs text-muted-foreground">
        Commit <code className="font-mono">{sha.slice(0, 7)}</code>
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No checks or statuses reported for this commit yet.</p>
      ) : (
        <ul className="grid divide-y rounded-lg border">
          {items.map((item, index) => {
            const style = CI_STYLE[item.state]
            return (
              <li key={`${item.source}-${item.name}-${index}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2">
                {item.url ? (
                  <a href={item.url} rel="noopener noreferrer" target="_blank" className="text-sm font-medium break-all underline underline-offset-2">
                    {item.name}
                  </a>
                ) : (
                  <span className="text-sm font-medium break-all">{item.name}</span>
                )}
                <StatusDot state={style.state} label={style.label} />
              </li>
            )
          })}
        </ul>
      )}
      {checksUnavailable ? (
        <p className="text-xs text-muted-foreground">
          GitHub Actions checks need the token&apos;s Checks permission; showing commit statuses only.
        </p>
      ) : null}
    </div>
  )
}
