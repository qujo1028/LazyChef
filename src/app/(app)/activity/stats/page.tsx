import type { Metadata } from "next"

import { PageHeading } from "@/components/page-heading"
import { ActivityTabs } from "@/features/activity/components/activity-tabs"
import { StatsView } from "@/features/activity/components/stats-view"
import { getStatsRows } from "@/features/activity/queries"
import { requireHousehold } from "@/features/household/queries"

export const metadata: Metadata = { title: "Stats" }

export default async function StatsPage() {
  const { viewer, household } = await requireHousehold()
  const stats = await getStatsRows(household.id)

  return (
    <>
      <PageHeading title="Activity" description="How your household cooks and shops." />
      <ActivityTabs current="/activity/stats" />
      <StatsView rows={stats.rows} members={stats.members} viewerId={viewer.id} serverNow={stats.fetchedAt} />
    </>
  )
}
