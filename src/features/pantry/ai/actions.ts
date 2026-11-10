"use server"

import { z } from "zod"

import { requireHousehold } from "@/features/household/queries"
import { askAiJson, isAiAvailable } from "@/lib/llm/ai"

import { resolveItems, type ResolveResult } from "../resolve"
import { firstIssue } from "../schemas"
import type { ActionResult } from "../types"
import { aiNote, buildSplitMessages, MAX_AI_TEXT, replyToLines, splitReplySchema } from "./split-text"

export type AiPreviewResult = ResolveResult & {
  /** Whether the AI's split was used (false: the local parser read the text as typed). */
  usedAi: boolean
  /** The text the review was built from: one item per line when the AI split it. */
  text: string
  /** A short note for the review (AI failed, items dropped), or null. */
  note: string | null
}

const textSchema = z
  .string()
  .trim()
  .min(1, "Type something to add.")
  .max(MAX_AI_TEXT, `The AI can split up to ${MAX_AI_TEXT.toLocaleString("en-US")} characters at a time. Shorten it or tap Review.`)

/**
 * Bulk add's "Use AI to split this": the AI only turns free text into one line per item; those
 * lines then go through the same preview as typed text (household fixes → catalog → Spoonacular),
 * so categories and the review work as usual. If the AI fails, the text is read the usual way.
 */
export async function previewItemsWithAi(text: string): Promise<ActionResult<AiPreviewResult>> {
  const parsed = textSchema.safeParse(text)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  // requireHousehold() re-checks the session (requireViewer) before anything is sent anywhere.
  const { household } = await requireHousehold()
  if (!isAiAvailable()) return { error: "The AI assistant isn't set up." }

  const reply = await askAiJson(buildSplitMessages(parsed.data), splitReplySchema, { maxTokens: 2000, temperature: 0 })
  let source = parsed.data
  let note: string | null
  let usedAi = false
  if (reply.ok) {
    const { lines, dropped } = replyToLines(reply.data)
    if (lines.length > 0) {
      source = lines.join("\n")
      usedAi = true
      note = aiNote({ ok: true, dropped })
    } else {
      note = aiNote({ ok: false, error: "The AI didn't find any items." })
    }
  } else {
    note = aiNote({ ok: false, error: reply.error })
  }

  try {
    const result = await resolveItems(household.id, source)
    if (result.items.length === 0) return { error: "Type something to add, like “2 lbs chicken breast”." }
    return { ...result, usedAi, text: source, note }
  } catch (error) {
    console.error("previewItemsWithAi failed:", error)
    return { error: "Couldn't read that list. Try again." }
  }
}
