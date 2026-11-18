import type { Metadata } from "next"

import { PageHeading } from "@/components/page-heading"
import { ActivityFeed } from "@/features/activity/components/activity-feed"
import { ActivityTabs } from "@/features/activity/components/activity-tabs"
import { StatsView } from "@/features/activity/components/stats-view"
import { getActivityFeed, getBoardRows, getStatsRows } from "@/features/activity/queries"
import { parseActivityView } from "@/features/activity/view"
import { LeaderboardView } from "@/features/habit/components/leaderboard-view"
import { requireHousehold } from "@/features/household/queries"

export const metadata: Metadata = { title: "Activity" }

/** One screen, three views: Log | Chart | Board (?view=). Each loads only its own data. */
export default async function ActivityPage({ searchParams }: PageProps<"/activity">) {
  const { viewer, household } = await requireHousehold()
  const view = parseActivityView((await searchParams).view)

  if (view === "chart") {
    const stats = await getStatsRows(household.id)
    return (
      <>
        <PageHeading title="Activity" description="How your household cooks and shops." />
        <ActivityTabs current="chart" />
        <StatsView
          rows={stats.rows}
          members={stats.members}
          viewerId={viewer.id}
          serverNow={stats.fetchedAt}
          truncated={stats.truncated}
        />
      </>
    )
  }

  if (view === "board") {
    const board = await getBoardRows(household.id)
    return (
      <>
        <PageHeading title="Activity" description="Who has cooked the most days." />
        <ActivityTabs current="board" />
        <LeaderboardView
          // Stays mounted across refreshes so the Weekly | All time choice is kept.
          key={household.id}
          rows={board.rows}
          members={board.members}
          viewerId={viewer.id}
          serverNow={board.fetchedAt}
          truncated={board.truncated}
          householdName={household.name}
          inviteCode={household.inviteCode}
        />
      </>
    )
  }

  const feed = await getActivityFeed(household.id)

  return (
    <>
      <PageHeading title="Activity" description="Who added, used, cooked and bought what." />
      <ActivityTabs current="log" />
      <ActivityFeed
        key={household.id}
        householdId={household.id}
        initialRows={feed.rows}
        members={feed.members}
        viewerId={viewer.id}
        serverNow={feed.fetchedAt}
      />
    </>
  )
}
