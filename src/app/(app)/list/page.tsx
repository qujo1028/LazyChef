import type { Metadata } from "next"
import { ListChecks } from "lucide-react"

import { EmptyState } from "@/components/empty-state"
import { PageHeading } from "@/components/page-heading"

export const metadata: Metadata = { title: "Shopping list" }

export default function ShoppingListPage() {
  return (
    <>
      <PageHeading title="Shopping list" description="Shared with everyone in your household." />
      <EmptyState icon={ListChecks} title="Nothing on the list yet">
        Add missing recipe ingredients with one tap, check things off at the store, then put them straight into the
        pantry.
      </EmptyState>
    </>
  )
}
