import type { Metadata } from "next"
import Link from "next/link"

import { ContactLine, LegalPage, Section } from "@/components/legal/legal-page"
import { OPERATOR_NAME } from "@/lib/site"

export const metadata: Metadata = {
  title: "Support",
  description: "Help with LazyChef, and how to get in touch.",
}

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "How do I share my pantry with housemates?",
    a: (
      <>
        Open <Link href="/household">Household</Link> and send them the invite link. Once they join, everyone sees the
        same pantry and shopping list, and changes show up for everyone right away.
      </>
    ),
  },
  {
    q: "Why don't I see recipes like Jamaican or Polish dishes?",
    a: (
      <>
        Recipe ideas start with everyday cuisines. Tap the Filters button next to the recipe search and turn on{" "}
        <strong>Include world recipes</strong> to see dishes from around the world.
      </>
    ),
  },
  {
    q: "It says recipe searches are “resting until tomorrow”.",
    a: "Some recipe ideas come from a service with a daily limit shared by everyone. Our own recipe library still works; extra ideas come back after midnight UTC.",
  },
  {
    q: "A barcode didn't find my product.",
    a: "Product lookups come from Open Food Facts, a free community database, so not every product is listed. You can still add the item by typing its name.",
  },
  {
    q: "How do I leave a household or switch between households?",
    a: (
      <>
        Both are on the <Link href="/household">Household</Link> page. If you leave as the last member, the household
        and its data are deleted.
      </>
    ),
  },
  {
    q: "How do I delete my account?",
    a: (
      <>
        Open <Link href="/household">Household</Link> and tap <strong>Delete account</strong>. The{" "}
        <Link href="/privacy">privacy policy</Link> explains what happens to your household&apos;s data.
      </>
    ),
  },
  {
    q: "I forgot my password.",
    a: (
      <>
        Use <Link href="/forgot-password">Forgot it?</Link> on the sign-in page and we&apos;ll email you a reset link. If
        you signed up with Google, use &ldquo;Continue with Google&rdquo; instead.
      </>
    ),
  },
]

export default function SupportPage() {
  return (
    <LegalPage
      title="Support"
      intro={<p>Answers to common questions, and how to reach us if something isn&apos;t working.</p>}
    >
      <Section title="Common questions">
        <div className="grid gap-2">
          {FAQ.map((item) => (
            <details key={item.q} className="group rounded-xl border bg-card px-4 py-3 open:pb-4">
              <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-3 font-medium [&::-webkit-details-marker]:hidden">
                {item.q}
                <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <div className="mt-2 text-muted-foreground">{item.a}</div>
            </details>
          ))}
        </div>
      </Section>

      <Section title="Contact us">
        <p>
          Found a bug, have an idea, or need help with your account? Email {OPERATOR_NAME} at{" "}
          <ContactLine />. Tell us
          what device you&apos;re using and what happened, and include a screenshot if you can. We usually reply within a
          few days.
        </p>
      </Section>
    </LegalPage>
  )
}
