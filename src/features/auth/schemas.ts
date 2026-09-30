// Password rules shared by the auth server actions and forms. They match the
// Supabase project's Auth settings (Sign In / Providers → Email): at least 8
// characters, with a lowercase letter, an uppercase letter, a digit and a
// symbol. Supabase rejects anything else, so checking here just gives a
// friendlier message sooner.
import { z } from "zod"

export const PASSWORD_MIN_LENGTH = 8

// Supabase Auth only counts these as symbols (spaces and accented letters don't).
const SYMBOLS = "!@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~"

export const PASSWORD_HINT = "At least 8 characters, with an uppercase letter, a lowercase letter, a number and a symbol."

export const newPassword = z
  .string()
  .min(PASSWORD_MIN_LENGTH, "Use at least 8 characters.")
  .refine((value) => /[a-z]/.test(value), "Add a lowercase letter.")
  .refine((value) => /[A-Z]/.test(value), "Add an uppercase letter.")
  .refine((value) => /[0-9]/.test(value), "Add a number.")
  .refine((value) => [...value].some((char) => SYMBOLS.includes(char)), "Add a symbol, like ! or #.")
