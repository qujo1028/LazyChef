import { ExternalLink } from "lucide-react"

import { Button } from "@/components/ui/button"
import { agoPhrase } from "@/features/admin/health"
import type { Deploy, DeployState } from "@/features/admin/github-deploys"
import { StatusDot, type HealthState } from "@/features/admin/components/status-dot"

/** Maps a deploy state to a dot. Off states are labelled with the raw state. */
export function deployHealth(state: DeployState): { state: HealthState; label?: string } {
  switch (state) {
    case "success":
      return { state: "ok" }
    case "failure":
    case "error":
      return { state: "down" }
    case "pending":
    case "in_progress":
    case "queued":
      return { state: "warn" }
    default:
      return { state: "off", label: state }
  }
}

const shortSha = (sha: string) => sha.slice(0, 7)

/** The production deploy: state, commit, age, and a link to the live site. */
export function ProductionDeploy({ deploy }: { deploy: Deploy & { commitMessage: string | null } }) {
  const health = deployHealth(deploy.state)
  const now = new Date()
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <StatusDot state={health.state} label={health.label} />
        <code className="font-mono text-xs">{shortSha(deploy.sha)}</code>
        <span className="text-xs text-muted-foreground">{agoPhrase(deploy.createdAt, now)}</span>
      </div>
      <p className="text-sm break-words">{deploy.commitMessage ?? "No commit message"}</p>
      {deploy.url ? (
        <Button asChild variant="outline" size="sm" className="w-fit">
          <a href={deploy.url} target="_blank" rel="noopener noreferrer">
            Open
            <ExternalLink aria-hidden />
          </a>
        </Button>
      ) : null}
    </div>
  )
}

/** Recent deploys, newest first: environment, state, short SHA and age. */
export function DeployList({ deploys }: { deploys: Deploy[] }) {
  if (deploys.length === 0) return <p className="text-sm text-muted-foreground">No deploys yet.</p>
  const now = new Date()
  return (
    <ul className="grid divide-y rounded-lg border">
      {deploys.map((deploy) => {
        const health = deployHealth(deploy.state)
        return (
          <li key={deploy.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2">
            <span className="text-sm font-medium break-all">{deploy.environment}</span>
            <StatusDot state={health.state} label={health.label} />
            <code className="font-mono text-xs">{shortSha(deploy.sha)}</code>
            <span className="text-xs text-muted-foreground">{agoPhrase(deploy.createdAt, now)}</span>
          </li>
        )
      })}
    </ul>
  )
}
