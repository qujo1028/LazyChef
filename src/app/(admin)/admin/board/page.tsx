import { KanbanSquare } from "lucide-react"

import { EmptyState } from "@/components/empty-state"
import { githubConfig } from "@/features/admin/github"
import { listOpenIssues, listOpenPulls, listRecentlyClosedIssues } from "@/features/admin/github-issues"
import { requireAdmin } from "@/features/admin/guard"
import { loadSafely } from "@/features/admin/load"
import { CardNotice } from "@/features/admin/components/admin-card"
import { BoardView } from "@/features/admin/components/board-view"

export default async function AdminBoardPage() {
  // Layouts and pages render in parallel, so each page checks too.
  await requireAdmin()

  const config = githubConfig()
  if (!config) {
    return <CardNotice kind="off" message="Set GITHUB_DASHBOARD_TOKEN and GITHUB_REPO to connect GitHub." />
  }

  const [open, closed, pulls] = await Promise.all([
    loadSafely(listOpenIssues),
    loadSafely(() => listRecentlyClosedIssues(7)),
    loadSafely(listOpenPulls),
  ])

  const header = (
    <p className="text-sm text-muted-foreground">
      Open issues and pull requests in {config.owner}/{config.repo}
    </p>
  )

  // Without the open issues there is no board to show.
  if (!open.ok) {
    return (
      <>
        {header}
        <CardNotice kind={open.kind} message={open.message} />
      </>
    )
  }

  const issues = [...open.data, ...(closed.ok ? closed.data : [])]
  const pullList = pulls.ok ? pulls.data : null
  if (issues.length === 0 && pullList?.length === 0 && closed.ok) {
    return (
      <>
        {header}
        <EmptyState icon={KanbanSquare} title="No issues yet">
          Issues and pull requests from GitHub will show up here.
        </EmptyState>
      </>
    )
  }

  return (
    <>
      {header}
      <BoardView
        issues={issues}
        pulls={pullList}
        now={new Date().toISOString()}
        reviewError={pulls.ok ? undefined : pulls.message}
        doneError={closed.ok ? undefined : closed.message}
      />
    </>
  )
}
