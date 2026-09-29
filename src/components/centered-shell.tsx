import Link from "next/link"

import { Brand } from "@/components/brand"

/** Layout for pages outside the tab bar: sign-in, onboarding, invites. */
export function CenteredShell({
  children,
  aside,
}: {
  children: React.ReactNode
  /** Optional control in the top-right corner, e.g. a sign-out button. */
  aside?: React.ReactNode
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-10">
      <header className="flex h-16 items-center justify-between">
        <Link href="/" aria-label="LazyChef home" className="inline-flex min-h-11 items-center">
          <Brand />
        </Link>
        {aside}
      </header>
      <main className="flex flex-1 flex-col justify-center gap-6 py-6">{children}</main>
    </div>
  )
}
