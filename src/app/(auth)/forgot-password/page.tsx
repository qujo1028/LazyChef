import type { Metadata } from "next"
import Link from "next/link"

import { AuthHeading } from "@/features/auth/components/auth-heading"
import { ForgotPasswordForm } from "@/features/auth/components/auth-forms"

export const metadata: Metadata = { title: "Reset your password" }

export default function ForgotPasswordPage() {
  return (
    <>
      <AuthHeading title="Reset your password" description="We'll email you a link to pick a new one." />
      <ForgotPasswordForm />
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </>
  )
}
