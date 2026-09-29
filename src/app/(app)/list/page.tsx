import type { Metadata } from "next"

import { requireHousehold } from "@/features/household/queries"
import { ListView } from "@/features/list/components/list-view"
import { getListSnapshot } from "@/features/list/queries"

export const metadata: Metadata = { title: "Shopping list" }

export default async function ShoppingListPage() {
  const { viewer, household } = await requireHousehold()
  const list = await getListSnapshot(household.id)

  return (
    <ListView
      key={household.id}
      householdId={household.id}
      viewerId={viewer.id}
      items={list.items}
      members={list.members}
      pantry={list.pantry}
      fetchedAt={list.fetchedAt}
      serverToday={list.today}
    />
  )
}
