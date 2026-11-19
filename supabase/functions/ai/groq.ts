// Chat completions through Groq's OpenAI-compatible API, ported from the web's
// src/lib/llm/client.ts. The key only goes in the Authorization header; nothing here logs or
// returns it. `fetch` is passed in so Vitest can run it.
import type { ChatMessage } from "../_shared/core/ai-idea.ts"

export const GROQ_BASE_URL = "https://api.groq.com/openai/v1"
export const DEFAULT_MODEL = "openai/gpt-oss-120b"

const TIMEOUT_MS = 20_000
/** Groq's free plan allows 30 requests a minute per model, per account. */
const MAX_PER_MINUTE = 30

export type LlmErrorCode =
  | "bad_key" // 401/403
  | "rate_limit" // 429, or this isolate's per-minute guard
  | "timeout"
  | "network"
  | "http" // any other non-2xx status
  | "bad_response" // not the JSON we expected

/** A failed call. Only the code (and status) is kept: never the reply body or the key. */
export class LlmError extends Error {
  readonly code: LlmErrorCode
  readonly status: number | null

  constructor(code: LlmErrorCode, status: number | null = null) {
    super(`Groq ${code}`)
    this.name = "LlmError"
    this.code = code
    this.status = status
  }
}

export type ChatOptions = { model?: string; maxTokens?: number; temperature?: number; json?: boolean }

export type Llm = { chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> }

type CompletionResponse = { choices?: { message?: { content?: string | null } }[] }

/**
 * A Groq client with this isolate's guards: at most MAX_PER_MINUTE calls a minute, and a pause
 * after a 429 (Retry-After, at most 2 minutes). They only stop calls that are sure to fail.
 */
export function createGroq(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  clock: () => number = Date.now,
): Llm {
  let blockedUntil = 0
  const recentStarts: number[] = []

  function checkGuards(now: number) {
    if (blockedUntil > now) throw new LlmError("rate_limit")
    while (recentStarts.length > 0 && recentStarts[0] <= now - 60_000) recentStarts.shift()
    if (recentStarts.length >= MAX_PER_MINUTE) throw new LlmError("rate_limit")
    recentStarts.push(now)
  }

  return {
    async chat(messages, { model = DEFAULT_MODEL, maxTokens = 1024, temperature = 0.3, json = false } = {}) {
      checkGuards(clock())

      let response: Response
      try {
        response = await fetchImpl(`${GROQ_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages,
            max_tokens: maxTokens,
            temperature,
            ...(json ? { response_format: { type: "json_object" } } : {}),
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
      } catch (cause) {
        const name = cause instanceof Error ? cause.name : ""
        throw new LlmError(name === "TimeoutError" || name === "AbortError" ? "timeout" : "network")
      }

      if (!response.ok) {
        await response.body?.cancel().catch(() => {})
        if (response.status === 401 || response.status === 403) throw new LlmError("bad_key", response.status)
        if (response.status === 429) {
          const retryAfter = Number(response.headers.get("Retry-After"))
          const seconds = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 120) : 10
          blockedUntil = clock() + seconds * 1000
          throw new LlmError("rate_limit", 429)
        }
        throw new LlmError("http", response.status)
      }

      let data: CompletionResponse
      try {
        data = (await response.json()) as CompletionResponse
      } catch {
        throw new LlmError("bad_response", response.status)
      }
      const content = data.choices?.[0]?.message?.content
      if (typeof content !== "string") throw new LlmError("bad_response", response.status)
      return content
    },
  }
}

/** Pulls the first JSON object out of a reply (models sometimes wrap it in ``` fences). Throws when there's none. */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start === -1 || end <= start) throw new SyntaxError("No JSON object in reply")
  return JSON.parse(text.slice(start, end + 1))
}
