"use client"

import { SectionError } from "@/components/section-error"

export default function StatsError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <SectionError what="stats" {...props} />
}
