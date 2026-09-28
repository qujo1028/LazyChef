import type { LucideIcon } from "lucide-react"

export function EmptyState({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon
  title: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-12 text-center">
      <span className="inline-flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="size-6" aria-hidden />
      </span>
      <h2 className="text-lg font-semibold">{title}</h2>
      {children ? <div className="max-w-xs text-sm text-muted-foreground">{children}</div> : null}
    </div>
  )
}
