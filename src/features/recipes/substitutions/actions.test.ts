import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ChatMessage } from "@/lib/llm/client"

vi.mock("server-only", () => ({}))

const requireViewer = vi.fn(async () => ({ id: "user-1", email: null }))
const requireHousehold = vi.fn(async () => ({ household: { id: "house-1" } }))
vi.mock("@/features/household/queries", () => ({
  requireViewer: () => requireViewer(),
  requireHousehold: () => requireHousehold(),
}))

const getPantryItems = vi.fn()
vi.mock("@/features/pantry/queries", () => ({ getPantryItems: (id: string) => getPantryItems(id) }))

const askAiJson = vi.fn()
const isAiAvailable = vi.fn(() => true)
vi.mock("@/lib/llm/ai", () => ({
  askAiJson: (...args: unknown[]) => askAiJson(...args),
  isAiAvailable: () => isAiAvailable(),
}))

const loadSubstitutionRecipe = vi.fn()
vi.mock("./context", () => ({ loadSubstitutionRecipe: (...args: unknown[]) => loadSubstitutionRecipe(...args) }))

const { suggestSubstitutions } = await import("./actions")

const recipe = {
  title: "Buttermilk pancakes",
  ingredients: [
    { original: "2 cups flour", name: "flour" },
    { original: "1 cup buttermilk", name: "buttermilk" },
  ],
  from: "cache",
}

function row(name: string) {
  return { name, quantity: 1, ingredient_id: null, is_staple: false, expires_on: null }
}

beforeEach(() => {
  loadSubstitutionRecipe.mockResolvedValue(recipe)
  getPantryItems.mockResolvedValue([row("greek yogurt"), row("milk")])
})

afterEach(() => {
  vi.clearAllMocks()
  isAiAvailable.mockReturnValue(true)
})

describe("suggestSubstitutions", () => {
  it("asks about the server's copy of the ingredient and checks the pantry flag itself", async () => {
    askAiJson.mockResolvedValue({
      ok: true,
      data: {
        swaps: [
          { use: "Greek yogurt", amount: "3/4 cup + 1/4 cup water", note: "Tangier.", pantryItem: null },
          { use: "Kefir", amount: "1:1", note: "Very close.", pantryItem: "kefir" },
        ],
        none: null,
      },
    })
    const result = await suggestSubstitutions({
      ref: "715538",
      index: 1,
      fallback: { title: "Made up", ingredients: [{ original: "x", name: "x" }] },
    })

    expect(requireViewer).toHaveBeenCalled()
    expect(loadSubstitutionRecipe).toHaveBeenCalledWith({ kind: "spoonacular", id: 715538 }, "house-1", {
      title: "Made up",
      ingredients: [{ original: "x", name: "x" }],
    })
    const messages = askAiJson.mock.calls[0][0] as ChatMessage[]
    const data = JSON.parse(messages[1].content.split("\n\n")[0])
    expect(data).toMatchObject({ recipe: "Buttermilk pancakes", missing: "1 cup buttermilk", pantry: ["greek yogurt", "milk"] })
    expect(result).toEqual({
      ingredient: "buttermilk",
      none: null,
      swaps: [
        { use: "Greek yogurt", amount: "3/4 cup + 1/4 cup water", note: "Tangier.", pantryName: "greek yogurt" },
        { use: "Kefir", amount: "1:1", note: "Very close.", pantryName: null },
      ],
    })
  })

  it("passes on the AI helper's friendly error", async () => {
    askAiJson.mockResolvedValue({ ok: false, error: "That's a lot of AI help for one hour. Try again in a bit." })
    expect(await suggestSubstitutions({ ref: "715538", index: 0 })).toEqual({
      error: "That's a lot of AI help for one hour. Try again in a bit.",
    })
  })

  it("does nothing without an AI key", async () => {
    isAiAvailable.mockReturnValue(false)
    const result = await suggestSubstitutions({ ref: "715538", index: 0 })
    expect(result.error).toBeDefined()
    expect(askAiJson).not.toHaveBeenCalled()
  })

  it("rejects an ingredient the recipe doesn't have, or a recipe it can't find", async () => {
    expect((await suggestSubstitutions({ ref: "715538", index: 5 })).error).toMatch(/isn't in this recipe/)
    loadSubstitutionRecipe.mockResolvedValue(null)
    expect((await suggestSubstitutions({ ref: "715538", index: 0 })).error).toMatch(/Couldn't find/)
    expect((await suggestSubstitutions({ ref: "bad ref", index: 0 })).error).toBeDefined()
    expect(askAiJson).not.toHaveBeenCalled()
  })
})
