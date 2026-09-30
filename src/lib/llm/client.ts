import "server-only"

// Server-only chat completions through Groq's OpenAI-compatible API.
//
// Free plan limits (per model): 30 requests a minute, 14,400 a day, plus token limits.
// No card needed; keys come from https://console.groq.com/keys.

export const GROQ_BASE_URL = "https://api.groq.com/openai/v1"
export const DEFAULT_MODEL = "openai/gpt-oss-120b"

const TIMEOUT_MS = 20_000
const MAX_PER_MINUTE = 30

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string }

export type LlmErrorCode =
  | "no_key" // GROQ_API_KEY isn't set
  | "bad_key" // 401/403
  | "rate_limit" // 429, or our own per-minute guard
  | "timeout"
  | "network"
  | "http" // any other non-2xx status
  | "bad_response" // not the JSON we expected

const MESSAGES: Record<LlmErrorCode, string> = {
  no_key: "The AI assistant isn't set up yet.",
  bad_key: "The AI service didn't accept the API key.",
  rate_limit: "The AI assistant is busy right now. Try again in a minute.",
  timeout: "The AI assistant took too long to answer.",
  network: "Couldn't reach the AI service.",
  http: "The AI service had a problem.",
  bad_response: "The AI service sent an unexpected answer.",
}

/** A failed LLM call. `message` is short and safe to show to users. */
export class LlmError extends Error {
  readonly code: LlmErrorCode
  /** HTTP status, when the API answered. */
  readonly status: number | null

  constructor(code: LlmErrorCode, options: { status?: number | null; cause?: unknown } = {}) {
    super(MESSAGES[code], { cause: options.cause })
    this.name = "LlmError"
    this.code = code
    this.status = options.status ?? null
  }
}

function apiKey(): string | null {
  return process.env.GROQ_API_KEY?.trim() || null
}

/** Whether GROQ_API_KEY is set. Check before offering LLM-backed features. */
export function isLlmConfigured(): boolean {
  return apiKey() !== null
}

// ── Guards (per server instance) ───────────────────────────────────────────────
// Groq's limits are per account; these only stop one instance from making calls
// that are sure to fail.

let blockedUntil = 0
const recentStarts: number[] = []

function checkGuards(now: number) {
  if (blockedUntil > now) throw new LlmError("rate_limit")
  while (recentStarts.length > 0 && recentStarts[0] <= now - 60_000) recentStarts.shift()
  if (recentStarts.length >= MAX_PER_MINUTE) throw new LlmError("rate_limit")
  recentStarts.push(now)
}

export type ChatOptions = {
  model?: string
  maxTokens?: number
  temperature?: number
  /** Ask for a JSON object back. The prompt must also mention JSON. */
  json?: boolean
}

type CompletionResponse = { choices?: { message?: { content?: string | null } }[] }

/**
 * Sends a chat completion and returns the reply text. Throws LlmError for every
 * failure (including a missing key, which never reaches the network).
 */
export async function chat(
  messages: ChatMessage[],
  { model = DEFAULT_MODEL, maxTokens = 1024, temperature = 0.3, json = false }: ChatOptions = {},
): Promise<string> {
  const key = apiKey()
  if (!key) throw new LlmError("no_key")

  checkGuards(Date.now())

  let response: Response
  try {
    response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    })
  } catch (cause) {
    const name = cause instanceof Error ? cause.name : ""
    throw new LlmError(name === "TimeoutError" || name === "AbortError" ? "timeout" : "network", { cause })
  }

  if (!response.ok) {
    await response.body?.cancel().catch(() => {})
    if (response.status === 401 || response.status === 403) throw new LlmError("bad_key", { status: response.status })
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("Retry-After"))
      const seconds = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 120) : 10
      blockedUntil = Date.now() + seconds * 1000
      throw new LlmError("rate_limit", { status: 429 })
    }
    throw new LlmError("http", { status: response.status })
  }

  let data: CompletionResponse
  try {
    data = (await response.json()) as CompletionResponse
  } catch (cause) {
    throw new LlmError("bad_response", { status: response.status, cause })
  }
  const content = data.choices?.[0]?.message?.content
  if (typeof content !== "string") throw new LlmError("bad_response", { status: response.status })
  return content
}
