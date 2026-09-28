"use client"

import { ChefHat, History, ListChecks, Refrigerator, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

const tabs: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/pantry", label: "Pantry", icon: Refrigerator },
  { href: "/recipes", label: "Recipes", icon: ChefHat },
  { href: "/list", label: "List", icon: ListChecks },
  { href: "/activity", label: "Activity", icon: History },
]

export function BottomNav() {
  const pathname = usePathname()
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/80"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-4">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-6" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
