import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

vi.mock("server-only", () => ({}))

const takeRateLimit = vi.fn<(bucket: string) => Promise<boolean>>()
vi.mock("@/lib/rate-limit", () => ({ takeRateLimit: (bucket: string) => takeRateLimit(bucket) }))

const chat = vi.fn<(...args: unknown[]) => Promise<string>>()
vi.mock("@/lib/llm/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm/client")>()
  return { ...actual, chat: (...args: unknown[]) => chat(...args), isLlmConfigured: () => !!process.env.GROQ_API_KEY }
})

const { askAiJson, extractJson, AI_LIMIT_MESSAGE } = await import("./ai")
const { LlmError } = await import("@/lib/llm/client")

const schema = z.object({ items: z.array(z.string()) })
const messages = [{ role: "user" as const, content: "Reply in JSON." }]

beforeEach(() => {
  vi.stubEnv("GROQ_API_KEY", "test-key")
  takeRateLimit.mockResolvedValue(true)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe("extractJson", () => {
  it("reads plain and fenced JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 })
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })

  it("throws when there's no object", () => {
    expect(() => extractJson("no json here")).toThrow()
  })
})

describe("askAiJson", () => {
  it("returns parsed data and asks for JSON mode", async () => {
    chat.mockResolvedValue('{"items":["milk"]}')
    expect(await askAiJson(messages, schema)).toEqual({ ok: true, data: { items: ["milk"] } })
    expect(chat).toHaveBeenCalledWith(messages, { json: true })
    expect(takeRateLimit).toHaveBeenCalledWith("ai")
  })

  it("refuses without a key, and never calls the model", async () => {
    vi.stubEnv("GROQ_API_KEY", "")
    const result = await askAiJson(messages, schema)
    expect(result.ok).toBe(false)
    expect(chat).not.toHaveBeenCalled()
  })

  it("stops at the hourly limit", async () => {
    takeRateLimit.mockResolvedValue(false)
    expect(await askAiJson(messages, schema)).toEqual({ ok: false, error: AI_LIMIT_MESSAGE })
    expect(chat).not.toHaveBeenCalled()
  })

  it("turns model errors and bad answers into friendly errors", async () => {
    chat.mockRejectedValueOnce(new LlmError("timeout"))
    expect(await askAiJson(messages, schema)).toEqual({ ok: false, error: new LlmError("timeout").message })

    chat.mockResolvedValueOnce('{"items":"not a list"}')
    expect((await askAiJson(messages, schema)).ok).toBe(false)

    chat.mockResolvedValueOnce("sorry")
    expect((await askAiJson(messages, schema)).ok).toBe(false)
  })
})
