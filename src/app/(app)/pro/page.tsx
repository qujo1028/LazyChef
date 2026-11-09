import type { Metadata } from "next"

import { ProPage } from "@/features/pro/components/pro-page"

export const metadata: Metadata = { title: "LazyChef Pro" }

/** The paywall as a full page: linked from onboarding and anywhere a sheet doesn't fit. */
export default function Page() {
  return <ProPage />
}
