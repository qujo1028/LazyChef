import type { Metadata } from "next"
import Link from "next/link"

import { ContactLine, LegalPage, Section } from "@/components/legal/legal-page"
import { LEGAL_UPDATED, OPERATOR_NAME } from "@/lib/site"

export const metadata: Metadata = {
  title: "Terms of use",
  description: "The rules for using LazyChef.",
}

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      updated={LEGAL_UPDATED}
      intro={
        <p>
          These terms are an agreement between you and {OPERATOR_NAME} (&ldquo;we&rdquo;), who runs LazyChef. By creating
          an account or using LazyChef, you agree to them. If you don&apos;t agree, please don&apos;t use the app.
        </p>
      }
    >
      <Section title="Your account">
        <ul>
          <li>You need to be at least 13 to use LazyChef.</li>
          <li>Keep your sign-in details to yourself. You&apos;re responsible for what happens in your account.</li>
          <li>Give us a real email address so you can reset your password and receive account notices.</li>
          <li>You can delete your account at any time from the Household page.</li>
        </ul>
      </Section>

      <Section title="Households">
        <p>
          A household is shared: every member can see and change its pantry, shopping list, recipes and activity.
          Anyone with the invite link can join, so share it only with people you trust. The household owner can remove
          members and reset the invite link. You&apos;re responsible for who you invite.
        </p>
      </Section>

      <Section title="Your content">
        <p>
          Recipes, photos and other things you add stay yours. You give us permission to store, copy and show them
          only as needed to run LazyChef for you and your household. Only add content you have the right to share,
          and don&apos;t add anything illegal, hateful or harmful.
        </p>
      </Section>

      <Section title="Using LazyChef fairly">
        <p>Please don&apos;t:</p>
        <ul>
          <li>break the law or anyone else&apos;s rights while using the app;</li>
          <li>try to get into other households, accounts or our systems without permission;</li>
          <li>overload, scrape or automate the app, or get around its usage limits;</li>
          <li>copy or resell LazyChef or the recipe data in it.</li>
        </ul>
        <p>We may suspend or close accounts that break these rules.</p>
      </Section>

      <Section title="Recipes, food and safety">
        <p>
          Recipe ideas come from TheMealDB, Spoonacular and other households&apos; own recipes, and we can&apos;t check every
          one. Ingredient matches, amounts, cook times and expiry reminders are estimates.{" "}
          <strong>
            Always check ingredients for allergies, follow food-safety guidance, and use your own judgment about
            whether food is safe to eat.
          </strong>{" "}
          LazyChef isn&apos;t medical or nutritional advice.
        </p>
      </Section>

      <Section title="Third-party services">
        <p>
          LazyChef relies on services we don&apos;t control, like recipe and product databases. Some features have daily
          limits and may be unavailable for a while (&ldquo;resting until tomorrow&rdquo;). Their data belongs to their
          owners and is credited in the app.
        </p>
      </Section>

      <Section title="Changes and availability">
        <p>
          We&apos;re always improving LazyChef, so features may change or be removed. We may update these terms; if a
          change is significant, we&apos;ll tell you in the app first. Continuing to use LazyChef after a change means you
          accept the new terms. We may stop offering LazyChef, and if we do, we&apos;ll give you notice where we can.
        </p>
      </Section>

      <Section title="No warranty">
        <p>
          LazyChef is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without warranties of any kind, to the
          fullest extent the law allows. We don&apos;t promise it will always be available, error-free, or that its
          information is accurate.
        </p>
      </Section>

      <Section title="Limitation of liability">
        <p>
          To the fullest extent the law allows, we aren&apos;t liable for indirect, incidental or consequential damages, or
          for lost data or food, arising from your use of LazyChef. Our total liability for any claim is limited to
          the greater of the amount you paid us in the past 12 months or US$50. Some places don&apos;t allow these
          limits, so they may not all apply to you.
        </p>
      </Section>

      <Section title="If you got LazyChef from the App Store">
        <ul>
          <li>These terms are between you and {OPERATOR_NAME}, not Apple. Apple isn&apos;t responsible for LazyChef or its
            content.</li>
          <li>Apple has no obligation to provide maintenance or support for LazyChef.</li>
          <li>If LazyChef fails to meet a warranty that applies by law, you can tell Apple, and Apple may refund the
            purchase price (if any). Apple has no other warranty obligation for LazyChef.</li>
          <li>Apple isn&apos;t responsible for any claims about LazyChef, including product liability claims, claims that
            it doesn&apos;t meet legal or regulatory requirements, or consumer protection claims.</li>
          <li>If someone claims LazyChef infringes their intellectual property, Apple isn&apos;t responsible for dealing
            with that claim.</li>
          <li>You confirm you&apos;re not in a country under a US government embargo or on a US government list of
            prohibited or restricted parties.</li>
          <li>You also agree to follow the App Store&apos;s Usage Rules. Apple and its subsidiaries are third-party
            beneficiaries of these terms and can enforce them against you.</li>
        </ul>
      </Section>

      <Section title="Governing law">
        <p>
          These terms are governed by the laws of the State of Colorado, USA, without regard to its conflict-of-law
          rules. Disputes will be handled in the state or federal courts located in Colorado, unless the law where you
          live gives you the right to bring them elsewhere.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about these terms? Contact {OPERATOR_NAME} at <ContactLine />. Our{" "}
          <Link href="/privacy">privacy policy</Link> explains how we handle your data.
        </p>
      </Section>
    </LegalPage>
  )
}
