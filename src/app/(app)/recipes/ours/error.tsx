"use client"

import { SectionError } from "@/components/section-error"

export default function OurRecipesError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <SectionError what="your recipes" {...props} />
}
