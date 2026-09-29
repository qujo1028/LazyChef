"use client"

import { SectionError } from "@/components/section-error"

export default function RecipesError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <SectionError what="recipes" {...props} />
}
