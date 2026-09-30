import Link from "next/link"

import { cn } from "@/lib/utils"

/** Two or three sibling pages as a segmented control ("Ideas | Saved"). */
export function SectionTabs({
  label,
  tabs,
  current,
}: {
  label: string
  tabs: readonly { href: string; label: string }[]
  current: string
}) {
  return (
    <nav aria-label={label} className="grid auto-cols-fr grid-flow-col rounded-xl bg-muted p-1">
      {tabs.map((tab) => {
        const active = tab.href === current
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-11 items-center justify-center rounded-lg text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
