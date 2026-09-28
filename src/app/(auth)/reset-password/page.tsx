import type { Metadata } from "next"

import { AuthHeading } from "@/features/auth/components/auth-heading"
import { ResetPasswordForm } from "@/features/auth/components/auth-forms"

export const metadata: Metadata = { title: "Choose a new password" }

// Reached from the reset email, which signs the user in first (see /auth/callback).
export default function ResetPasswordPage() {
  return (
    <>
      <AuthHeading title="Choose a new password" description="You'll use it the next time you sign in." />
      <ResetPasswordForm />
    </>
  )
}
