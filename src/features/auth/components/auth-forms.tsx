"use client"

import Link from "next/link"
import { useActionState } from "react"

import { FormMessage } from "@/components/form-message"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  requestPasswordReset,
  signIn,
  signUp,
  updatePassword,
  type AuthFormState,
} from "@/features/auth/actions"
import { PASSWORD_HINT, PASSWORD_MIN_LENGTH } from "@/features/auth/schemas"
import { withConnectionErrors } from "@/lib/call-action"

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    withConnectionErrors(signIn),
    initialError ? { error: initialError } : undefined,
  )
  return (
    <form action={action} className="grid gap-5">
      <input type="hidden" name="next" value={next} />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={state?.email} />
        </Field>
        <Field>
          <div className="flex items-center justify-between">
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Link href="/forgot-password" className="-my-3 inline-flex min-h-11 items-center text-sm text-muted-foreground underline-offset-4 hover:underline">
              Forgot it?
            </Link>
          </div>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
      </FieldGroup>
      <FormMessage error={state?.error} notice={state?.notice} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  )
}

export function SignupForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(withConnectionErrors(signUp), undefined)
  if (state?.notice) return <FormMessage notice={state.notice} />
  return (
    <form action={action} className="grid gap-5">
      <input type="hidden" name="next" value={next} />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="displayName">Your name</FieldLabel>
          <Input id="displayName" name="displayName" autoComplete="given-name" maxLength={60} required />
          <FieldDescription>What your housemates see next to things you add.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={state?.email} />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} required />
          <FieldDescription>{PASSWORD_HINT}</FieldDescription>
        </Field>
      </FieldGroup>
      <FormMessage error={state?.error} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  )
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(withConnectionErrors(requestPasswordReset), undefined)
  return (
    <form action={action} className="grid gap-5">
      <Field>
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={state?.email} />
      </Field>
      <FormMessage error={state?.error} notice={state?.notice} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  )
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(withConnectionErrors(updatePassword), undefined)
  return (
    <form action={action} className="grid gap-5">
      <Field>
        <FieldLabel htmlFor="password">New password</FieldLabel>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} required />
        <FieldDescription>{PASSWORD_HINT}</FieldDescription>
      </Field>
      <FormMessage error={state?.error} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Saving…" : "Save password"}
      </Button>
    </form>
  )
}
