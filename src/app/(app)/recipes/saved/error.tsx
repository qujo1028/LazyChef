"use client"

import { SectionError } from "@/components/section-error"

export default function SavedRecipesError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <SectionError what="saved recipes" {...props} />
}
