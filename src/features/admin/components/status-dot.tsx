import { cn } from "@/lib/utils"

export type HealthState = "ok" | "warn" | "down" | "off"

const STYLES: Record<HealthState, { dot: string; label: string }> = {
  ok: { dot: "bg-emerald-500", label: "OK" },
  warn: { dot: "bg-amber-500", label: "Warning" },
  down: { dot: "bg-red-500", label: "Down" },
  off: { dot: "bg-muted-foreground/40", label: "Not set up" },
}

/** A coloured dot plus a text label (colour is never the only signal). */
export function StatusDot({ state, label, className }: { state: HealthState; label?: string; className?: string }) {
  const style = STYLES[state]
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", className)}>
      <span className={cn("size-2.5 shrink-0 rounded-full", style.dot)} aria-hidden />
      <span>{label ?? style.label}</span>
    </span>
  )
}
