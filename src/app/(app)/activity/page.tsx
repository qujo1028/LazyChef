import type { Metadata } from "next"
import { History } from "lucide-react"

import { EmptyState } from "@/components/empty-state"
import { PageHeading } from "@/components/page-heading"

export const metadata: Metadata = { title: "Activity" }

export default function ActivityPage() {
  return (
    <>
      <PageHeading title="Activity" description="Who added, used and cooked what." />
      <EmptyState icon={History} title="No activity yet">
        When anyone in the household adds or uses something, it shows up here.
      </EmptyState>
    </>
  )
}
