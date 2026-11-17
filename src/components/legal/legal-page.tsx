import Link from "next/link"

import { SUPPORT_EMAIL } from "@/lib/site"

/** A readable long-form page: title, "last updated" line and sections. */
export function LegalPage({
  title,
  updated,
  intro,
  children,
}: {
  title: string
  updated?: string
  intro?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <article className="grid gap-8 text-[15px] leading-relaxed">
      <header className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {updated ? <p className="text-sm text-muted-foreground">Last updated {updated}</p> : null}
        {intro ? <div className="text-muted-foreground">{intro}</div> : null}
      </header>
      {children}
      <LegalNav />
    </article>
  )
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_li]:pl-1 [&_ul]:grid [&_ul]:list-disc [&_ul]:gap-1.5 [&_ul]:pl-5">
      <h2 className="font-heading text-xl font-semibold">{title}</h2>
      {children}
    </section>
  )
}

/** The support address as a mailto link, or a note that it's on its way. */
export function ContactLine({ fallback = "our support address (coming soon)" }: { fallback?: string }) {
  return SUPPORT_EMAIL ? (
    <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
  ) : (
    <span className="text-muted-foreground">{fallback}</span>
  )
}

function LegalNav() {
  return (
    <nav aria-label="More about LazyChef" className="flex flex-wrap gap-x-5 gap-y-2 border-t pt-6 text-sm text-muted-foreground">
      <Link href="/privacy" className="hover:text-foreground">
        Privacy
      </Link>
      <Link href="/terms" className="hover:text-foreground">
        Terms
      </Link>
      <Link href="/support" className="hover:text-foreground">
        Support
      </Link>
      <Link href="/" className="hover:text-foreground">
        Open LazyChef
      </Link>
    </nav>
  )
}
