import Link from "next/link"

import { cn } from "@/lib/utils"

/** "Privacy · Terms · Support" links for page footers. */
export function LegalLinks({ className }: { className?: string }) {
  const link = "inline-flex min-h-11 items-center px-1 hover:text-foreground"
  return (
    <nav aria-label="About LazyChef" className={cn("flex justify-center gap-3 text-xs text-muted-foreground", className)}>
      <Link href="/privacy" className={link}>
        Privacy
      </Link>
      <Link href="/terms" className={link}>
        Terms
      </Link>
      <Link href="/support" className={link}>
        Support
      </Link>
    </nav>
  )
}
