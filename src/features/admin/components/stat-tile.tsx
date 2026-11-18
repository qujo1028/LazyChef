import { cn } from "@/lib/utils"

/** One headline number with a label and an optional hint line ("of 50", "+12 this week"). */
export function StatTile({
  label,
  value,
  hint,
  tone = "default",
  className,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  tone?: "default" | "warn" | "bad"
  className?: string
}) {
  return (
    <div className={cn("grid min-w-0 gap-0.5 rounded-lg border px-3 py-2", className)}>
      <span className="truncate text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-2xl font-semibold tabular-nums tracking-tight",
          tone === "warn" && "text-amber-600 dark:text-amber-400",
          tone === "bad" && "text-destructive",
        )}
      >
        {value}
      </span>
      {hint ? <span className="truncate text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  )
}

/** A responsive row of StatTiles: 2 across on phones, up to 4 on wide screens. */
export function StatGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4", className)}>{children}</div>
}

const numberFormat = new Intl.NumberFormat("en-US")
const usdFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
const percentFormat = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 })

export const formatCount = (n: number | null | undefined) => (n == null ? "–" : numberFormat.format(n))
export const formatUsd = (n: number | null | undefined) => (n == null ? "–" : usdFormat.format(n))
/** `ratio` is 0..1. */
export const formatPercent = (ratio: number | null | undefined) => (ratio == null ? "–" : percentFormat.format(ratio))
