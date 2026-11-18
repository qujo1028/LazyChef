"use client"

import { Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"

import { usePro } from "./pro-provider"

/** Shown when a free household has used its week of AI recipe help: the message and a way to Pro. */
export function AiLimitNotice({ message, className }: { message: string; className?: string }) {
  const { openPaywall } = usePro()
  return (
    <div className={className ?? "grid gap-2 rounded-2xl border bg-card p-4 text-sm"} role="status">
      <p className="text-muted-foreground">{message}</p>
      <Button type="button" size="lg" className="h-11 w-full text-base" onClick={() => openPaywall("ai")}>
        <Sparkles aria-hidden /> See what Pro includes
      </Button>
    </div>
  )
}
