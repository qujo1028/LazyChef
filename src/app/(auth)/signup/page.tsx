import type { Metadata } from "next"
import Link from "next/link"

import { AuthHeading, OrDivider } from "@/features/auth/components/auth-heading"
import { SignupForm } from "@/features/auth/components/auth-forms"
import { GoogleButton } from "@/features/auth/components/google-button"
import { safeNext } from "@/lib/safe-next"
import { firstParam } from "@/lib/search-params"

export const metadata: Metadata = { title: "Create an account" }

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const params = await searchParams
  const next = safeNext(firstParam(params.next), "/onboarding")
  const invited = next.startsWith("/join/")

  return (
    <>
      <AuthHeading
        title={invited ? "You're invited" : "Create your account"}
        description={
          invited
            ? "Make an account to join your household's shared pantry."
            : "One pantry and one shopping list for everyone you live with."
        }
      />
      <GoogleButton next={next} />
      <OrDivider />
      <SignupForm next={next} />
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href={`/login?next=${encodeURIComponent(next)}`}
          className="font-medium text-foreground underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>
    </>
  )
}
