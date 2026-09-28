import type { Metadata } from "next"
import Link from "next/link"

import { AuthHeading, OrDivider } from "@/features/auth/components/auth-heading"
import { LoginForm } from "@/features/auth/components/auth-forms"
import { GoogleButton } from "@/features/auth/components/google-button"
import { safeNext } from "@/lib/safe-next"
import { firstParam } from "@/lib/search-params"

export const metadata: Metadata = { title: "Sign in" }

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams
  const next = safeNext(firstParam(params.next))
  const error = firstParam(params.error)
  const nextQuery = next === "/" ? "" : `?next=${encodeURIComponent(next)}`

  return (
    <>
      <AuthHeading title="Welcome back" description="Sign in to your household's pantry." />
      <GoogleButton next={next} />
      <OrDivider />
      <LoginForm next={next} initialError={error} />
      <p className="text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link href={`/signup${nextQuery}`} className="font-medium text-foreground underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </>
  )
}
