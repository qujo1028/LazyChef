import type { Metadata } from "next"

import { PageHeading } from "@/components/page-heading"
import { ActivityTabs } from "@/features/activity/components/activity-tabs"
import { ActivityFeed } from "@/features/activity/components/activity-feed"
import { getActivityFeed } from "@/features/activity/queries"
import { requireHousehold } from "@/features/household/queries"

export const metadata: Metadata = { title: "Activity" }

export default async function ActivityPage() {
  const { viewer, household } = await requireHousehold()
  const feed = await getActivityFeed(household.id)

  return (
    <>
      <PageHeading title="Activity" description="Who added, used, cooked and bought what." />
      <ActivityTabs current="/activity" />
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
