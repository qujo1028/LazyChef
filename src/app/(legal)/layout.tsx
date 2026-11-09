import Link from "next/link"

import { Brand } from "@/components/brand"

/** Public pages anyone can read, signed in or not: privacy, terms, support. */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pb-12">
      <header className="flex h-16 items-center">
        <Link href="/" aria-label="LazyChef home" className="inline-flex min-h-11 items-center">
          <Brand />
        </Link>
      </header>
      <main className="py-6">{children}</main>
    </div>
  )
}
