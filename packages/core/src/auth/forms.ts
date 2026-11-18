// Sign-in form rules for the Expo app, with the same messages as the web server actions
// (src/features/auth/actions.ts). Passwords use the shared newPassword rule.
import { z } from "zod"

import { newPassword } from "./schemas"

export const emailAddress = z.string().trim().pipe(z.email("Enter a valid email address."))

export const displayName = z
  .string()
  .trim()
  .min(1, "Tell your housemates what to call you.")
  .max(60, "Keep it to 60 characters or fewer.")

export const signInInput = z.object({
  email: emailAddress,
  password: z.string().min(1, "Enter your password."),
})

export const signUpInput = z.object({ displayName, email: emailAddress, password: newPassword })

export const forgotPasswordInput = z.object({ email: emailAddress })

export const resetPasswordInput = z
  .object({ password: newPassword, confirm: z.string() })
  .refine((value) => value.password === value.confirm, {
    message: "The two passwords don't match.",
    path: ["confirm"],
  })

/** The first message for each top-level field, for showing under each input. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "")
    if (key && !(key in errors)) errors[key] = issue.message
  }
  return errors
}
