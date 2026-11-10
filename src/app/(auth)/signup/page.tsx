import type { Metadata } from "next"
import Link from "next/link"

import { isAppleSignInEnabled } from "@/features/auth/apple"
import { AppleButton } from "@/features/auth/components/apple-button"
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
      {isAppleSignInEnabled() && <AppleButton next={next} />}
      <GoogleButton next={next} />
      <OrDivider />
      <SignupForm next={next} />
      <p className="-mt-2 text-center text-xs text-muted-foreground">
        By creating an account, you agree to the{" "}
        <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">
          Terms of use
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
          Privacy policy
        </Link>
        .
      </p>
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
