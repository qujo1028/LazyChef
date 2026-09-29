"use client"

import { SectionError } from "@/components/section-error"

export default function ListError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <SectionError what="the shopping list" {...props} />
}
