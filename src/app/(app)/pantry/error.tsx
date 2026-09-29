"use client"

import { SectionError } from "@/components/section-error"

export default function PantryError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <SectionError what="the pantry" {...props} />
}
