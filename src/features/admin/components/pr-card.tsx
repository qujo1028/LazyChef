import { CircleCheck, CircleDashed, CircleX, ExternalLink } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { ageLabel, type BoardPull, type CiState, type ReviewState } from "@/features/admin/board"

const REVIEW_LABELS: Record<ReviewState, string> = {
  approved: "Approved",
  changes_requested: "Changes requested",
  review_needed: "Review needed",
}

const CI_LABELS: Record<CiState, { text: string; Icon: typeof CircleCheck }> = {
  success: { text: "CI passing", Icon: CircleCheck },
  failure: { text: "CI failing", Icon: CircleX },
  pending: { text: "CI running", Icon: CircleDashed },
}

export function PrCard({ pull, now }: { pull: BoardPull; now: string }) {
  const ci = pull.ci ? CI_LABELS[pull.ci] : null
  // The linked-issue URL is the PR's own URL with /pull/N swapped for /issues/M.
  const issueUrl = (n: number) => pull.url.replace(/\/pull\/\d+$/, `/issues/${n}`)

  return (
    <li className="min-w-0 rounded-xl border bg-card p-3 text-sm text-card-foreground">
      <a href={pull.url} target="_blank" rel="noreferrer" className="font-medium break-words hover:underline">
        {pull.title}
        <ExternalLink className="ml-1 inline size-3 align-baseline text-muted-foreground" aria-hidden />
        <span className="sr-only"> (opens GitHub)</span>
      </a>

      <div className="mt-2 flex flex-wrap gap-1">
        {pull.draft ? <Badge variant="secondary">Draft</Badge> : null}
        {pull.reviewState ? (
          <Badge variant={pull.reviewState === "changes_requested" ? "destructive" : "outline"}>
            {pull.reviewState === "approved" ? <CircleCheck aria-hidden /> : null}
            {REVIEW_LABELS[pull.reviewState]}
          </Badge>
        ) : null}
        {ci ? (
          <Badge variant={pull.ci === "failure" ? "destructive" : "outline"}>
            <ci.Icon aria-hidden />
            {ci.text}
          </Badge>
        ) : null}
      </div>

      {pull.linkedIssues.length ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Closes{" "}
          {pull.linkedIssues.map((n, i) => (
            <span key={n}>
              {i > 0 ? ", " : ""}
              <a href={issueUrl(n)} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                #{n}
              </a>
            </span>
          ))}
        </p>
      ) : null}

      <p className="mt-2 text-xs text-muted-foreground">
        #{pull.number} · {pull.author} · {ageLabel(pull.createdAt, now)}
      </p>
    </li>
  )
}
