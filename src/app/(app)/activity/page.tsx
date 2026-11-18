import type { Metadata } from "next"

import { PageHeading } from "@/components/page-heading"
import { ActivityFeed } from "@/features/activity/components/activity-feed"
import { ActivityTabs, parseActivityView } from "@/features/activity/components/activity-tabs"
import { StatsView } from "@/features/activity/components/stats-view"
import { getActivityFeed, getStatsRows } from "@/features/activity/queries"
import { requireHousehold } from "@/features/household/queries"

export const metadata: Metadata = { title: "Activity" }

/** One screen, two views: Log | Stats (?view=stats). Each loads only its own data. */
export default async function ActivityPage({ searchParams }: PageProps<"/activity">) {
  const { viewer, household } = await requireHousehold()

  if (parseActivityView((await searchParams).view) === "stats") {
    const stats = await getStatsRows(household.id)
    return (
      <>
        <PageHeading title="Activity" description="How your household cooks and shops." />
        <ActivityTabs current="stats" />
        <StatsView rows={stats.rows} members={stats.members} viewerId={viewer.id} serverNow={stats.fetchedAt} />
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
