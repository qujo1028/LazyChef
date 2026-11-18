"use client"

import { SectionError } from "@/components/section-error"

export default function AdminError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <SectionError what="this admin page" {...props} />
}
