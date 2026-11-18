import type { Metadata } from "next"

import { AdminTabs } from "@/features/admin/components/admin-tabs"
import { requireAdmin } from "@/features/admin/guard"

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireAdmin()

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-8">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">LazyChef admin</h1>
        <p className="text-sm text-muted-foreground">{viewer.email}</p>
      </header>
      <AdminTabs />
      <main className="flex flex-1 flex-col gap-6">{children}</main>
    </div>
  )
}
