import "server-only"

import type { z } from "zod"

import { chat, isLlmConfigured, LlmError, type ChatMessage } from "@/lib/llm/client"
import { takeRateLimit } from "@/lib/rate-limit"

/**
 * Shared entry point for LazyChef's AI features (quick-add from text, pantry recipe, scanned-name
 * clean-up, substitutions). Callers re-check auth with requireViewer() first; this adds the
 * per-person hourly limit (the 'ai' bucket) and checks the model's JSON against a zod schema.
 */

export type AiResult<T> = { ok: true; data: T } | { ok: false; error: string }

/** Whether AI features should be offered at all (GROQ_API_KEY is set). */
export function isAiAvailable(): boolean {
  return isLlmConfigured()
}

export const AI_LIMIT_MESSAGE = "That's a lot of AI help for one hour. Try again in a bit."
const BAD_ANSWER_MESSAGE = "The AI assistant gave an answer LazyChef couldn't use. Try again."

/** Pulls the first JSON object out of a reply (models sometimes wrap it in ``` fences). */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start === -1 || end <= start) throw new SyntaxError("No JSON object in reply")
  return JSON.parse(text.slice(start, end + 1))
}

/**
 * Asks the model for a JSON object matching `schema`. The prompt must ask for JSON. User-typed
 * text should go in a user message, never pasted into the system prompt.
 */
export async function askAiJson<S extends z.ZodType>(
  messages: ChatMessage[],
  schema: S,
  options: { maxTokens?: number; temperature?: number } = {},
): Promise<AiResult<z.infer<S>>> {
  if (!isAiAvailable()) return { ok: false, error: new LlmError("no_key").message }
  if (!(await takeRateLimit("ai"))) return { ok: false, error: AI_LIMIT_MESSAGE }

  let reply: string
  try {
    reply = await chat(messages, { ...options, json: true })
  } catch (error) {
    if (error instanceof LlmError) {
      console.error(`[ai] ${error.code}`, error.status ?? "", error.cause ?? "")
      return { ok: false, error: error.message }
    }
    throw error
  }

  let parsed: unknown
  try {
    parsed = extractJson(reply)
  } catch {
    return { ok: false, error: BAD_ANSWER_MESSAGE }
  }
  const result = schema.safeParse(parsed)
  if (!result.success) {
    console.error("[ai] reply didn't match the schema:", result.error.issues.slice(0, 3))
    return { ok: false, error: BAD_ANSWER_MESSAGE }
  }
  return { ok: true, data: result.data }
}
