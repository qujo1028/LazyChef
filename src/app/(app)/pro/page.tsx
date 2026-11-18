import type { Metadata } from "next"

import { PageHeading } from "@/components/page-heading"
import { requireHousehold } from "@/features/household/queries"
import { ProView } from "@/features/subscription/components/pro-view"

export const metadata: Metadata = { title: "LazyChef Pro" }

export default async function ProPage() {
  const { viewer } = await requireHousehold()

  return (
    <>
      <PageHeading title="LazyChef Pro" description="Support LazyChef and unlock Pro features." />
      <ProView customerEmail={viewer.email ?? undefined} />
    </>
  )
}
