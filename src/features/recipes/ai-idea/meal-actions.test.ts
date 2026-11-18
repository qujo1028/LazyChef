import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const requireViewer = vi.fn(async () => ({ id: "user-1" }))
vi.mock("@/features/household/queries", () => ({ requireViewer: () => requireViewer() }))

const loadIdeaPantry = vi.fn(async (): Promise<unknown> => ({ householdId: "house-1", diet: null, names: ["eggs", "spinach"] }))
vi.mock("./context", () => ({ loadIdeaPantry: () => loadIdeaPantry() }))

const getCached = vi.fn(async (): Promise<unknown> => null)
const putCached = vi.fn(async () => {})
vi.mock("./meal-cache", () => ({
  mealIdeasCacheKey: () => "key",
  getCachedMealIdeas: () => getCached(),
  putCachedMealIdeas: (...args: unknown[]) => putCached(...(args as [])),
}))

const askAiJson = vi.fn<(...args: unknown[]) => Promise<unknown>>()
vi.mock("@/lib/llm/ai", () => ({ askAiJson: (...args: unknown[]) => askAiJson(...args) }))

const { getMealIdeas } = await import("./meal-actions")

const idea = (title: string) => ({
  title,
  description: "",
  servings: 2,
  minutes: 10,
  ingredients: [
    { name: "eggs", amount: "2", fromPantry: true },
    { name: "feta", amount: "50 g", fromPantry: false },
  ],
  steps: ["Cook."],
})

afterEach(() => vi.clearAllMocks())

describe("getMealIdeas", () => {
  it("makes one AI request for three ideas and caches them", async () => {
    askAiJson.mockResolvedValue({ ok: true, data: { ideas: [idea("A"), idea("B"), idea("C")] } })
    const result = await getMealIdeas("main course")
    expect(requireViewer).toHaveBeenCalled()
    expect(askAiJson).toHaveBeenCalledTimes(1)
    expect(result.error).toBeUndefined()
    if (result.error === undefined) {
      expect(result.ideas).toHaveLength(3)
      expect(result.ideas[0].missing).toEqual(["feta"])
    }
    expect(putCached).toHaveBeenCalledTimes(1)
  })

  it("uses the cache without asking the AI", async () => {
    getCached.mockResolvedValueOnce([idea("Cached")])
    const result = await getMealIdeas("lunch")
    expect(askAiJson).not.toHaveBeenCalled()
    expect(result.error === undefined && result.ideas[0].recipe.title).toBe("Cached")
  })

  it("rejects unknown meals and passes on AI errors quietly", async () => {
    expect(await getMealIdeas("brunch; drop table")).toEqual({ error: "Pick a meal first." })
    askAiJson.mockResolvedValue({ ok: false, error: "limit" })
    expect(await getMealIdeas("lunch")).toEqual({ error: "limit" })
    expect(putCached).not.toHaveBeenCalled()
  })
})
