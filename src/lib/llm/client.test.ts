import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

type Module = typeof import("./client")

/** Fresh module state (rate window, block) for each test. */
async function load(): Promise<Module> {
  vi.resetModules()
  return import("./client")
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
  vi.stubEnv("GROQ_API_KEY", "test-key")
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("chat", () => {
  it("fails with no_key without touching the network when the key is missing", async () => {
    vi.stubEnv("GROQ_API_KEY", "")
    const { chat, isLlmConfigured } = await load()
    expect(isLlmConfigured()).toBe(false)
    await expect(chat([{ role: "user", content: "hi" }])).rejects.toMatchObject({ code: "no_key" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("sends the key as a bearer header and returns the reply text", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: "Hello!" } }] }))
    const { chat, DEFAULT_MODEL } = await load()
    await expect(chat([{ role: "user", content: "hi" }], { json: true })).resolves.toBe("Hello!")
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions")
    expect(init.headers.Authorization).toBe("Bearer test-key")
    const body = JSON.parse(init.body)
    expect(body.model).toBe(DEFAULT_MODEL)
    expect(body.response_format).toEqual({ type: "json_object" })
  })

  it("maps 401 to bad_key", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: {} }, 401))
    const { chat } = await load()
    await expect(chat([{ role: "user", content: "hi" }])).rejects.toMatchObject({ code: "bad_key", status: 401 })
  })

  it("blocks further calls after a 429 until Retry-After passes", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: {} }, 429, { "Retry-After": "30" }))
    const { chat } = await load()
    await expect(chat([{ role: "user", content: "a" }])).rejects.toMatchObject({ code: "rate_limit" })
    await expect(chat([{ role: "user", content: "b" }])).rejects.toMatchObject({ code: "rate_limit" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("rejects a reply without message content", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [] }))
    const { chat } = await load()
    await expect(chat([{ role: "user", content: "hi" }])).rejects.toMatchObject({ code: "bad_response" })
  })
})
