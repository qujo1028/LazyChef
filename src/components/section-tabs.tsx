import Link from "next/link"

import { cn } from "@/lib/utils"

/** Two or three sibling pages as a slim underline tab bar ("Ideas | Saved | Ours"). */
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
    <nav aria-label={label} className="-mt-1 flex gap-6 border-b">
      {tabs.map((tab) => {
        const active = tab.href === current
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative -mb-px inline-flex h-11 items-center text-sm font-medium transition-colors outline-none focus-visible:text-foreground",
              "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors",
              active ? "text-foreground after:bg-primary" : "text-muted-foreground after:bg-transparent hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
