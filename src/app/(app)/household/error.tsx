"use client"

import { SectionError } from "@/components/section-error"

export default function HouseholdError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <SectionError what="your household" {...props} />
}
