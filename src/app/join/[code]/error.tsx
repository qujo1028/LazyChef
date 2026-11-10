"use client"

import { CenteredShell } from "@/components/centered-shell"
import { SectionError } from "@/components/section-error"

export default function JoinError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <CenteredShell>
      <SectionError what="this invite" {...props} />
    </CenteredShell>
  )
}
