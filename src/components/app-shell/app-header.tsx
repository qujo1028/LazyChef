import { ChevronRight } from "lucide-react"
import Link from "next/link"

import { BrandMark } from "@/components/brand"
import { UserAvatar } from "@/components/user-avatar"

export function AppHeader({
  householdName,
  displayName,
  avatarUrl,
}: {
  householdName: string
  displayName: string
  avatarUrl: string | null
}) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex h-14 items-center gap-3 px-4">
        <BrandMark className="size-8 rounded-lg" />
        <Link
          href="/household"
          className="flex min-h-11 min-w-0 flex-1 items-center gap-1 font-semibold"
          aria-label={`Household settings for ${householdName}`}
        >
          <span className="truncate">{householdName}</span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </Link>
        <Link href="/household" aria-label="Your account" className="-mr-1.5 inline-flex size-11 shrink-0 items-center justify-center rounded-full">
          <UserAvatar name={displayName} src={avatarUrl} className="size-8" />
        </Link>
      </div>
    </header>
  )
}
