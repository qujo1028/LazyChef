"use client"

import { SectionError } from "@/components/section-error"

export default function NewRecipeError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <SectionError what="the recipe form" {...props} />
}
