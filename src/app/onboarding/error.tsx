"use client"

import { CenteredShell } from "@/components/centered-shell"
import { SectionError } from "@/components/section-error"

export default function OnboardingError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <CenteredShell>
      <SectionError what="this page" {...props} />
    </CenteredShell>
  )
}
