import type { Metadata } from "next"
import { ChefHat } from "lucide-react"

import { EmptyState } from "@/components/empty-state"
import { PageHeading } from "@/components/page-heading"

export const metadata: Metadata = { title: "Recipes" }

export default function RecipesPage() {
  return (
    <>
      <PageHeading title="Recipes" description="What you can cook with what you have." />
      <EmptyState icon={ChefHat} title="Recipe ideas are on the way">
        Once your pantry has a few things in it, you&apos;ll see recipes you can make now and ones that are only an
        ingredient or two away.
      </EmptyState>
    </>
  )
}
