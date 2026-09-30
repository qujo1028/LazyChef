import type { Metadata } from "next"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

import { PageHeading } from "@/components/page-heading"
import { requireHousehold } from "@/features/household/queries"
import { RecipeForm } from "@/features/recipes/components/recipe-form"

export const metadata: Metadata = { title: "Add a recipe" }

export default async function NewRecipePage() {
  const { household } = await requireHousehold()
  return (
    <>
      <Link
        href="/recipes/ours"
        className="-my-2 inline-flex h-11 w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Our recipes
      </Link>
      <PageHeading title="Add your own recipe" description="It shows up in Make now and Almost there for everyone in your household." />
      <RecipeForm householdId={household.id} />
    </>
  )
}
