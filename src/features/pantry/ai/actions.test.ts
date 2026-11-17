import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const askAiJson = vi.fn()
const isAiAvailable = vi.fn(() => true)
vi.mock("@/lib/llm/ai", () => ({
  askAiJson: (...args: unknown[]) => askAiJson(...args),
  isAiAvailable: () => isAiAvailable(),
}))

const requireHousehold = vi.fn(async () => ({ household: { id: "house-1" } }))
vi.mock("@/features/household/queries", () => ({ requireHousehold: () => requireHousehold() }))

const resolveItems = vi.fn(async (_householdId: string, text: string) => ({
  items: text.split("\n").map((raw) => ({ raw, name: raw })),
  spoonacular: { called: false, pointsLeft: null, error: null },
}))
vi.mock("../resolve", () => ({ resolveItems: (id: string, text: string) => resolveItems(id, text) }))

const { previewItemsWithAi } = await import("./actions")

beforeEach(() => {
  isAiAvailable.mockReturnValue(true)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe("previewItemsWithAi", () => {
  it("previews the AI's lines through the usual resolver", async () => {
    askAiJson.mockResolvedValue({
      ok: true,
      data: { items: [{ name: "chicken breast", quantity: 2, unit: "lb" }, { name: "milk" }] },
    })
    const result = await previewItemsWithAi("2 lbs chicken and some milk")
    expect(requireHousehold).toHaveBeenCalled()
    const [messages] = askAiJson.mock.calls[0]
    expect(messages[1]).toEqual({ role: "user", content: "2 lbs chicken and some milk" })
    expect(resolveItems).toHaveBeenCalledWith("house-1", "2 lb chicken breast\nmilk")
    expect(result).toMatchObject({ usedAi: true, text: "2 lb chicken breast\nmilk", note: null })
  })

  it("falls back to the typed text when the AI fails", async () => {
    askAiJson.mockResolvedValue({ ok: false, error: "The AI assistant is busy." })
    const result = await previewItemsWithAi("milk, eggs")
    expect(resolveItems).toHaveBeenCalledWith("house-1", "milk, eggs")
    expect(result).toMatchObject({ usedAi: false, text: "milk, eggs" })
    expect(result.error === undefined && result.note).toMatch(/busy\. We split it the usual way/)
  })

  it("falls back when the AI finds nothing", async () => {
    askAiJson.mockResolvedValue({ ok: true, data: { items: [] } })
    const result = await previewItemsWithAi("milk")
    expect(resolveItems).toHaveBeenCalledWith("house-1", "milk")
    expect(result).toMatchObject({ usedAi: false })
  })

  it("rejects empty and too-long text without calling the AI", async () => {
    expect(await previewItemsWithAi("   ")).toHaveProperty("error")
    expect(await previewItemsWithAi("x".repeat(1001))).toHaveProperty("error")
    expect(askAiJson).not.toHaveBeenCalled()
    expect(requireHousehold).not.toHaveBeenCalled()
  })

  it("doesn't call the AI when it isn't set up", async () => {
    isAiAvailable.mockReturnValue(false)
    expect(await previewItemsWithAi("milk")).toHaveProperty("error")
    expect(askAiJson).not.toHaveBeenCalled()
  })
})
