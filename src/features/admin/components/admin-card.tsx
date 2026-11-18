import { CircleAlert, PlugZap } from "lucide-react"
import { Suspense } from "react"

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

/** One dashboard card: a title, an optional description and header action, and a body. */
export function AdminCard({
  title,
  description,
  action,
  className,
  children,
}: {
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <Card className={cn("min-w-0", className)}>
      <CardHeader>
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent className="min-w-0">{children}</CardContent>
    </Card>
  )
}

/** Placeholder while a card's data loads. */
export function AdminCardSkeleton({ title, rows = 3, className }: { title: string; rows?: number; className?: string }) {
  return (
    <AdminCard title={title} className={className}>
      <div className="grid gap-2" aria-busy="true" aria-label={`Loading ${title}`}>
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-5 w-full" />
        ))}
      </div>
    </AdminCard>
  )
}

/** Streams one async card in on its own, with a skeleton until it's ready. */
export function AdminSuspense({
  title,
  rows,
  className,
  children,
}: {
  title: string
  rows?: number
  className?: string
  children: React.ReactNode
}) {
  return <Suspense fallback={<AdminCardSkeleton title={title} rows={rows} className={className} />}>{children}</Suspense>
}

/**
 * The body of a card whose data didn't load: `off` when a token or key isn't set,
 * `error` when the call failed. Pair with loadSafely().
 */
export function CardNotice({ kind, message }: { kind: "off" | "error"; message: string }) {
  const Icon = kind === "off" ? PlugZap : CircleAlert
  return (
    <p
      role={kind === "error" ? "alert" : undefined}
      className={cn(
        "flex items-start gap-2 rounded-lg border border-dashed px-3 py-2 text-sm",
        kind === "error" ? "border-destructive/40 text-destructive" : "text-muted-foreground",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </p>
  )
}
