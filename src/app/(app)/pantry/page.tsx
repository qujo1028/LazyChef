import type { Metadata } from "next"

import { requireHousehold } from "@/features/household/queries"
import { PantryView } from "@/features/pantry/components/pantry-view"
import { getPantrySnapshot } from "@/features/pantry/queries"

export const metadata: Metadata = { title: "Pantry" }

export default async function PantryPage() {
  const { viewer, household } = await requireHousehold()
  const pantry = await getPantrySnapshot(household.id)

  return (
    <PantryView
      key={household.id}
      householdId={household.id}
      viewerId={viewer.id}
      items={pantry.items}
      members={pantry.members}
      fetchedAt={pantry.fetchedAt}
      serverToday={pantry.today}
    />
  )
}
