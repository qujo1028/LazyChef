import type { Metadata } from "next"
import { ChevronLeft } from "lucide-react"
import Link from "next/link"

import { PageHeading } from "@/components/page-heading"
import { BulkAddForm } from "@/features/pantry/components/bulk-add-form"
import { localDateKey } from "@/features/pantry/dates"
import { firstParam } from "@/lib/search-params"

export const metadata: Metadata = { title: "Add groceries" }

export default async function BulkAddPage({ searchParams }: PageProps<"/pantry/add">) {
  // ?text= carries over what was typed in the quick add sheet.
  const text = (firstParam((await searchParams).text) ?? "").slice(0, 5000)

  return (
    <>
      <Link
        href="/pantry"
        className="-mt-2 -mb-3 -ml-2 inline-flex min-h-11 items-center gap-1 self-start rounded-md pr-2 text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Pantry
      </Link>
      <PageHeading
        title="Just went shopping?"
        description="Type or paste everything you bought. You'll check it all before anything is added."
      />
      <BulkAddForm key={text} defaultText={text} serverToday={localDateKey()} />
    </>
  )
}
