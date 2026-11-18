"use client"

import { usePathname } from "next/navigation"

import { SectionTabs } from "@/components/section-tabs"

const TABS = [
  { href: "/admin", label: "Board" },
  { href: "/admin/health", label: "Health" },
  { href: "/admin/limits", label: "Limits" },
] as const

/** The layout can't see the path, so this picks the current tab on the client. */
export function AdminTabs() {
  const pathname = usePathname()
  const current =
    TABS.find((tab) => tab.href !== "/admin" && (pathname === tab.href || pathname.startsWith(`${tab.href}/`)))
      ?.href ?? "/admin"
  return <SectionTabs label="Admin" tabs={TABS} current={current} />
}
