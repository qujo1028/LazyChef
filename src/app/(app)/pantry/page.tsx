import type { Metadata } from "next"

import { requireHousehold } from "@/features/household/queries"
import { PantryView } from "@/features/pantry/components/pantry-view"
import { getPantrySnapshot } from "@/features/pantry/queries"
import { isAiAvailable } from "@/lib/llm/ai"
import { firstParam } from "@/lib/search-params"

export const metadata: Metadata = { title: "Pantry" }

export default async function PantryPage({ searchParams }: PageProps<"/pantry">) {
  const { viewer, household } = await requireHousehold()
  // /pantry/add redirects here as ?add=bulk. ?text= carries what was typed in the quick add
  // sheet, ?scan=1 comes from "Scan barcodes" there.
  const params = await searchParams
  const initialBulk =
    firstParam(params.add) === "bulk"
      ? { text: (firstParam(params.text) ?? "").slice(0, 5000), scan: firstParam(params.scan) === "1" }
      : null
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
      aiAvailable={isAiAvailable()}
      initialBulk={initialBulk}
    />
  )
}
