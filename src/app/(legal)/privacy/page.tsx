import type { Metadata } from "next"
import Link from "next/link"

import { ContactLine, LegalPage, Section } from "@/components/legal/legal-page"
import { LEGAL_UPDATED, OPERATOR_NAME } from "@/lib/site"

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What LazyChef collects, why, who it's shared with, and how to delete it.",
}

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      updated={LEGAL_UPDATED}
      intro={
        <p>
          LazyChef is a shared pantry, shopping list and recipe finder for households, run by {OPERATOR_NAME}. This
          page explains what we collect, why, who helps us run the app, and how to delete your data. We don&apos;t sell
          your data, show ads, or track you across other apps and websites.
        </p>
      }
    >
      <Section title="What we collect">
        <ul>
          <li>
            <strong>Your account:</strong> your email address, the name you choose, and your password (stored only as a
            secure hash). If you sign in with Google, we receive your name, email address and profile photo from
            Google.
          </li>
          <li>
            <strong>Your household&apos;s content:</strong> the household&apos;s name, its members and invite code, pantry
            items (names, amounts, categories, expiry dates), the shopping list, recipes you add and their photos,
            recipes you save, what you cook, and an activity history of changes (&ldquo;Alex added eggs&rdquo;).
          </li>
          <li>
            <strong>Barcodes you scan</strong>, so we can look up the product.
          </li>
          <li>
            <strong>Basic usage and performance data:</strong> pages visited, the type of device and browser, and how
            fast pages load. This is collected without cookies and isn&apos;t used to identify you.
          </li>
        </ul>
        <p>We don&apos;t collect your location, contacts, or payment information.</p>
      </Section>

      <Section title="How we use it">
        <ul>
          <li>To run the app: sign you in, keep your household&apos;s pantry and list in sync, and suggest recipes.</li>
          <li>To show housemates who changed what.</li>
          <li>To keep the app working and secure: fixing bugs, preventing abuse, and limiting how often expensive
            features can be used.</li>
          <li>To email you about your account, such as confirming your address or resetting your password.</li>
        </ul>
      </Section>

      <Section title="Who can see your household's data">
        <p>
          Everyone in a household can see and change its pantry, shopping list, recipes and activity, and sees each
          member&apos;s name. Anyone with your household&apos;s invite link can join it, so only share it with people you
          live with. The household owner can reset the link and remove members.
        </p>
      </Section>

      <Section title="Services that help run LazyChef">
        <p>We share data only with these services, and only what each needs to do its job:</p>
        <ul>
          <li>
            <strong>Supabase</strong> stores accounts, household data and recipe photos, and handles sign-in.
          </li>
          <li>
            <strong>Vercel</strong> hosts the app and provides the cookie-free usage and performance statistics
            described above.
          </li>
          <li>
            <strong>Google</strong>, only if you choose &ldquo;Continue with Google&rdquo;.
          </li>
          <li>
            <strong>Spoonacular</strong> receives the names of ingredients in your pantry (or what you type) to find
            recipes and understand ingredient amounts. It doesn&apos;t receive your name, email or household.
          </li>
          <li>
            <strong>Groq</strong> (an AI service), only when you use an AI feature and agree to it first: it receives
            what that feature needs, such as text you type, item and product names in your pantry, or a recipe&apos;s
            ingredients. It doesn&apos;t receive your name, email or household.
          </li>
          <li>
            <strong>Open Food Facts</strong> receives the barcodes you scan, to look up the product. The lookup comes
            from our servers, not your device.
          </li>
          <li>
            <strong>TheMealDB and Spoonacular image servers</strong>: recipe photos load from their servers, which see
            your device&apos;s IP address as any website would.
          </li>
        </ul>
        <p>
          We may also share information if the law requires it, or to protect the safety of LazyChef&apos;s users.
        </p>
      </Section>

      <Section title="Cookies and storage on your device">
        <p>
          LazyChef uses cookies only to keep you signed in. Your device also remembers small preferences, such as
          your light or dark theme. There are no advertising or tracking cookies.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          We keep your data for as long as you have an account. Recipe search results from Spoonacular are cached for
          at most an hour. Deleted data may remain in encrypted backups for a short time before it&apos;s overwritten.
        </p>
      </Section>

      <Section title="Deleting your account">
        <p>
          You can delete your account at any time in the app: open <Link href="/household">Household</Link>, then tap{" "}
          <strong>Delete account</strong>. This removes your account, your profile and your household memberships
          right away.
        </p>
        <ul>
          <li>If you were the only member of a household, that household and everything in it, including recipe
            photos, is deleted too.</li>
          <li>If others still live in the household, they keep its pantry, list and recipes. Things you added stay, but
            are no longer linked to your name. If you were the owner, the longest-standing member becomes the owner.</li>
        </ul>
      </Section>

      <Section title="Your choices and rights">
        <p>
          You can see and edit your name and household content in the app at any time. Depending on where you live,
          you may also have the right to request a copy of your data, ask us to correct or delete it, or object to how
          we use it. To make a request, contact us using the details below; we&apos;ll respond within 30 days.
        </p>
      </Section>

      <Section title="Children">
        <p>
          LazyChef isn&apos;t directed at children under 13, and we don&apos;t knowingly collect personal information from
          them. If you think a child has given us their information, contact us and we&apos;ll delete it.
        </p>
      </Section>

      <Section title="Security">
        <p>
          Data is encrypted in transit and at rest. Each household&apos;s data can only be read by its members, enforced by
          the database itself. No system is perfectly secure, but we work to protect your information.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          If we change this policy, we&apos;ll update the date at the top. If a change is significant, we&apos;ll tell you in
          the app before it takes effect.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about privacy? Contact {OPERATOR_NAME} at <ContactLine />.
        </p>
      </Section>
    </LegalPage>
  )
}
