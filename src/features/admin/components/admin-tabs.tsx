"use client"

import { usePathname } from "next/navigation"

import { SectionTabs } from "@/components/section-tabs"

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/board", label: "Board" },
  { href: "/admin/health", label: "Health" },
  { href: "/admin/limits", label: "Limits" },
  { href: "/admin/support", label: "Support" },
] as const

/** The layout can't see the path, so this picks the current tab on the client. */
export function AdminTabs() {
  const pathname = usePathname()
  const current =
    TABS.find((tab) => tab.href !== "/admin" && (pathname === tab.href || pathname.startsWith(`${tab.href}/`)))
      ?.href ?? "/admin"
  // Five tabs don't fit a 320px phone, so the bar scrolls sideways instead of the page.
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <SectionTabs label="Admin" tabs={TABS} current={current} />
    </div>
  )
}
