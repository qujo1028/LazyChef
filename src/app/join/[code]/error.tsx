"use client"

import { SectionError } from "@/components/section-error"

export default function JoinError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <SectionError what="this invite" {...props} />
}
