// Checks and cleans a request body against the ai contract. Everything from the app is
// untrusted: anything that doesn't fit is a 400, never passed on to the model or the database.
import { AI_IDEA_MEALS, AI_MAX_HINT_LENGTH, type AiIdeaMeal } from "../_shared/core/ai-contract.ts"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MEALS: ReadonlySet<string> = new Set(AI_IDEA_MEALS)
/** A hint longer than this is refused before cleaning (the cleaned one must fit AI_MAX_HINT_LENGTH). */
const MAX_RAW_HINT_LENGTH = 500

/** A request after cleaning: the hint is single-spaced and trimmed, "" when there's none. */
export type AiCleanRequest =
  | { action: "ideas"; householdId: string; meal: AiIdeaMeal; hint: string }
  | { action: "allowance"; householdId: string }

export type Parsed = { ok: true; request: AiCleanRequest } | { ok: false; error: string }

const fail = (error: string): Parsed => ({ ok: false, error })

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

/** Control and format characters out (they can hide text from the person), whitespace single-spaced and trimmed. */
export function cleanHint(value: string): string {
  // deno-lint-ignore no-control-regex
  return value.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2064\ufeff]/g, " ").replace(/\s+/g, " ").trim()
}

function parseHousehold(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value.toLowerCase() : null
}

/** The request, cleaned, or why it was refused (a short message, safe to show). */
export function parseRequest(body: unknown): Parsed {
  if (!isRecord(body)) return fail("Send a JSON object.")
  const householdId = parseHousehold(body.householdId)
  switch (body.action) {
    case "allowance":
      if (!householdId) return fail("Pick a household.")
      return { ok: true, request: { action: "allowance", householdId } }
    case "ideas": {
      if (!householdId) return fail("Pick a household.")
      if (typeof body.meal !== "string" || !MEALS.has(body.meal)) return fail("Pick a meal first.")
      const { hint } = body
      if (hint !== undefined && hint !== null && (typeof hint !== "string" || hint.length > MAX_RAW_HINT_LENGTH)) {
        return fail(`Keep the hint under ${AI_MAX_HINT_LENGTH} characters.`)
      }
      const clean = typeof hint === "string" ? cleanHint(hint) : ""
      if (clean.length > AI_MAX_HINT_LENGTH) return fail(`Keep the hint under ${AI_MAX_HINT_LENGTH} characters.`)
      return { ok: true, request: { action: "ideas", householdId, meal: body.meal as AiIdeaMeal, hint: clean } }
    }
    default:
      return fail("Unknown action.")
  }
}
