"use client"

import { useEffect } from "react"

import { Button } from "@/components/ui/button"

/**
 * An error.tsx body: keeps the tab bar and the rest of the app up when one section fails
 * to load, with a button to try just that section again.
 */
export function SectionError({ what, error, retry }: { what: string; error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div role="alert" className="grid justify-items-center gap-3 rounded-2xl border border-dashed px-6 py-8 text-center">
      <h1 className="text-lg font-semibold">Couldn&apos;t load {what}</h1>
      <p className="max-w-xs text-sm text-muted-foreground">Check your connection, then try again.</p>
      <Button size="lg" className="h-12 w-full max-w-xs text-base" onClick={() => retry()}>
        Try again
      </Button>
    </div>
  )
}
