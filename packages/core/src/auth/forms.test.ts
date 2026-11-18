import { describe, expect, it } from "vitest"

import { fieldErrors, resetPasswordInput, signInInput, signUpInput } from "./forms"

describe("signInInput", () => {
  it("trims the email", () => {
    expect(signInInput.parse({ email: "  sam@example.com ", password: "x" })).toEqual({
      email: "sam@example.com",
      password: "x",
    })
  })

  it("explains each missing field", () => {
    const result = signInInput.safeParse({ email: "nope", password: "" })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(fieldErrors(result.error)).toEqual({
      email: "Enter a valid email address.",
      password: "Enter your password.",
    })
  })
})

describe("signUpInput", () => {
  it("accepts a good form", () => {
    const parsed = signUpInput.parse({ displayName: " Sam ", email: "sam@example.com", password: "Pantry1!" })
    expect(parsed.displayName).toBe("Sam")
  })

  it("keeps only the first message per field", () => {
    const result = signUpInput.safeParse({ displayName: "", email: "sam@example.com", password: "a" })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(fieldErrors(result.error)).toEqual({
      displayName: "Tell your housemates what to call you.",
      password: "Use at least 8 characters.",
    })
  })
})

describe("resetPasswordInput", () => {
  it("needs the two passwords to match", () => {
    const result = resetPasswordInput.safeParse({ password: "Pantry1!", confirm: "Pantry2!" })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(fieldErrors(result.error)).toEqual({ confirm: "The two passwords don't match." })
  })
})
