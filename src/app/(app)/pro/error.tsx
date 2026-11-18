"use client"

import { SectionError } from "@/components/section-error"

export default function ProError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <SectionError what="LazyChef Pro" {...props} />
}
