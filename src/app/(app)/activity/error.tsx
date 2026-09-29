"use client"

import { SectionError } from "@/components/section-error"

export default function ActivityError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <SectionError what="activity" {...props} />
}
