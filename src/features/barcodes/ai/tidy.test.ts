import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const askAiJson = vi.fn()
vi.mock("@/lib/llm/ai", () => ({ askAiJson: (...args: unknown[]) => askAiJson(...args) }))

const { tidyScannedProduct } = await import("./tidy")

afterEach(() => vi.clearAllMocks())

describe("tidyScannedProduct", () => {
  it("sends only the product's fields and returns a suggestion", async () => {
    askAiJson.mockResolvedValue({ ok: true, data: { name: "Mac and cheese", ingredient: null, size: "7.25 oz" } })
    const result = await tidyScannedProduct({ product_name: "KRFT MAC&CHS ORIG 7.25OZ", brands: "Kraft" })
    expect(result).toEqual({
      ok: true,
      data: { name: "mac and cheese", ingredient: null, quantity: 7.25, unit: "oz", line: "7¼ oz mac and cheese" },
    })
    const [messages] = askAiJson.mock.calls[0] as [{ role: string; content: string }[]]
    expect(JSON.parse(messages[1].content).product).toEqual({
      name: "KRFT MAC&CHS ORIG 7.25OZ",
      brand: "Kraft",
      categories: [],
      quantity: null,
    })
  })

  it("passes the AI's error through", async () => {
    askAiJson.mockResolvedValue({ ok: false, error: "Too much AI" })
    expect(await tidyScannedProduct({ product_name: "X" })).toEqual({ ok: false, error: "Too much AI" })
  })

  it("doesn't call the AI for a product without a name", async () => {
    const result = await tidyScannedProduct({ brands: "Kraft" })
    expect(result.ok).toBe(false)
    expect(askAiJson).not.toHaveBeenCalled()
  })

  it("fails softly when the reply's name cleans to nothing", async () => {
    askAiJson.mockResolvedValue({ ok: true, data: { name: "“”" } })
    expect((await tidyScannedProduct({ product_name: "X" })).ok).toBe(false)
  })
})
