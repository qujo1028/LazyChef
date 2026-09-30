"use client"

import { SectionError } from "@/components/section-error"

export default function EditRecipeError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <SectionError what="this recipe" {...props} />
}
