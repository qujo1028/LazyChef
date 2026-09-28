import type { Metadata } from "next"
import { Refrigerator } from "lucide-react"

import { EmptyState } from "@/components/empty-state"
import { PageHeading } from "@/components/page-heading"

export const metadata: Metadata = { title: "Pantry" }

export default function PantryPage() {
  return (
    <>
      <PageHeading title="Pantry" description="Everything your household has on hand." />
      <EmptyState icon={Refrigerator} title="Your pantry is empty">
        Coming next: type things like &ldquo;2 lbs chicken breast&rdquo; or &ldquo;1 dozen eggs&rdquo; and they&apos;ll
        sort themselves into categories.
      </EmptyState>
    </>
  )
}
