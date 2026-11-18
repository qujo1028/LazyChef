import { describe, expect, it, vi } from "vitest"

import { createGroq, extractJson, GROQ_BASE_URL, LlmError } from "./groq.ts"

const reply = (content: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status, headers })

describe("createGroq", () => {
  it("sends the key only in the Authorization header and asks for JSON", async () => {
    const fetchImpl = vi.fn(async () => reply('{"ideas": []}'))
    const llm = createGroq("secret-key", fetchImpl as never)
    await expect(llm.chat([{ role: "user", content: "hi" }], { json: true, maxTokens: 10 })).resolves.toBe('{"ideas": []}')
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${GROQ_BASE_URL}/chat/completions`)
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-key")
    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({ max_tokens: 10, response_format: { type: "json_object" } })
    expect(String(init.body)).not.toContain("secret-key")
  })

  it("turns failures into codes, never the reply body", async () => {
    const cases: [Response | Error, string][] = [
      [new Response("no", { status: 401 }), "bad_key"],
      [new Response("oops", { status: 500 }), "http"],
      [new Response("not json"), "bad_response"],
      [reply(null), "bad_response"],
      [Object.assign(new Error("t"), { name: "TimeoutError" }), "timeout"],
      [new TypeError("offline"), "network"],
    ]
    for (const [outcome, code] of cases) {
      const llm = createGroq("k", (async () => {
        if (outcome instanceof Error) throw outcome
        return outcome
      }) as never)
      const error = await llm.chat([]).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(LlmError)
      expect((error as LlmError).code).toBe(code)
      expect((error as LlmError).message).not.toContain("oops")
    }
  })

  it("pauses after a 429 for Retry-After seconds", async () => {
    let now = 1_000_000
    const fetchImpl = vi.fn(async () => new Response("", { status: 429, headers: { "Retry-After": "5" } }))
    const llm = createGroq("k", fetchImpl as never, () => now)
    await expect(llm.chat([])).rejects.toMatchObject({ code: "rate_limit" })
    await expect(llm.chat([])).rejects.toMatchObject({ code: "rate_limit" })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    now += 6000
    await expect(llm.chat([])).rejects.toMatchObject({ code: "rate_limit" })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it("stops at 30 calls a minute", async () => {
    const now = 5_000_000
    const fetchImpl = vi.fn(async () => reply("{}"))
    const llm = createGroq("k", fetchImpl as never, () => now)
    for (let i = 0; i < 30; i++) await llm.chat([])
    await expect(llm.chat([])).rejects.toMatchObject({ code: "rate_limit" })
    expect(fetchImpl).toHaveBeenCalledTimes(30)
  })
})

describe("extractJson", () => {
  it("reads a fenced object and refuses text without one", () => {
    expect(extractJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 })
    expect(() => extractJson("no json here")).toThrow()
  })
})
