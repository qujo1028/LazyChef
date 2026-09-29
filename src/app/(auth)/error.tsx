"use client"

import { SectionError } from "@/components/section-error"

export default function AuthError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <SectionError what="this page" {...props} />
}
