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

const getMyPreferences = vi.fn()
vi.mock("@/features/preferences/queries", () => ({ getMyPreferences: () => getMyPreferences() }))

const takeAiAllowance = vi.fn(async (): Promise<unknown> => null)
vi.mock("@/features/pro/ai-allowance", () => ({ takeAiAllowance: () => takeAiAllowance() }))

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
  title: "Spicy noodles",
  ingredients: [
    { original: "8 oz noodles", name: "noodles" },
    { original: "2 tbsp gochujang", name: "gochujang" },
  ],
  from: "cache",
}

const NO_PREFS = { diet: "none", allergies: [], cuisines: [], worldRecipes: false }

function row(name: string) {
  return { name, quantity: 1, ingredient_id: null, is_staple: false, expires_on: null }
}

beforeEach(() => {
  loadSubstitutionRecipe.mockResolvedValue(recipe)
  getPantryItems.mockResolvedValue([row("sriracha"), row("milk")])
  getMyPreferences.mockResolvedValue(NO_PREFS)
})

afterEach(() => {
  vi.clearAllMocks()
  isAiAvailable.mockReturnValue(true)
})

describe("suggestSubstitutions free allowance", () => {
  it("stops before the AI when the free week is used up", async () => {
    takeAiAllowance.mockResolvedValueOnce({ error: "Used up", proLimit: true, resetsAt: null })
    const result = await suggestSubstitutions({ ref: "715538", index: 1 })
    expect(result).toMatchObject({ error: "Used up", proLimit: true })
    expect(askAiJson).not.toHaveBeenCalled()
  })

  it("doesn't take a use for a refusal", async () => {
    loadSubstitutionRecipe.mockResolvedValue({
      title: "Pan-seared steak",
      ingredients: [{ original: "1 lb ribeye steak", name: "ribeye steak" }],
      from: "cache",
    })
    await suggestSubstitutions({ ref: "715538", index: 0 })
    expect(takeAiAllowance).not.toHaveBeenCalled()
  })
})

describe("suggestSubstitutions", () => {
  it("asks about the server's copy of the ingredient and checks the pantry flag itself", async () => {
    askAiJson.mockResolvedValue({
      ok: true,
      data: {
        swaps: [
          { use: "Red pepper flakes", amount: "1 tsp", note: "Hotter, less sweet.", pantryItem: "red pepper flakes" },
          { use: "Sriracha", amount: "1 tbsp", note: "Thinner and garlicky.", pantryItem: null },
          { use: "Bacon", amount: "2 slices", note: "Smoky.", pantryItem: null },
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
    expect(data).toMatchObject({ recipe: "Spicy noodles", missing: "2 tbsp gochujang", pantry: ["milk", "sriracha"] })
    // Pantry first; the protein is dropped as implausible.
    expect(result).toEqual({
      ingredient: "gochujang",
      none: null,
      swaps: [
        { use: "Sriracha", amount: "1 tbsp", note: "Thinner and garlicky.", pantryName: "sriracha", allergens: [] },
        { use: "Red pepper flakes", amount: "1 tsp", note: "Hotter, less sweet.", pantryName: null, allergens: [] },
      ],
    })
  })

  it("passes on the AI helper's friendly error", async () => {
    askAiJson.mockResolvedValue({ ok: false, error: "That's a lot of AI help for one hour. Try again in a bit." })
    expect(await suggestSubstitutions({ ref: "715538", index: 1 })).toEqual({
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

  it("refuses a steak without asking the AI", async () => {
    loadSubstitutionRecipe.mockResolvedValue({
      title: "Pan-seared steak",
      ingredients: [{ original: "1 lb ribeye steak", name: "ribeye steak" }],
      from: "cache",
    })
    const result = await suggestSubstitutions({ ref: "715538", index: 0 })
    expect(result).toMatchObject({ swaps: [], none: expect.stringMatching(/star of the dish/) })
    expect(askAiJson).not.toHaveBeenCalled()
  })

  it("refuses the egg in an omelette without asking the AI", async () => {
    loadSubstitutionRecipe.mockResolvedValue({
      title: "Cheese Omelette",
      ingredients: [
        { original: "3 eggs", name: "egg" },
        { original: "1/4 cup cheddar", name: "cheddar" },
      ],
      from: "cache",
    })
    const result = await suggestSubstitutions({ ref: "715538", index: 0 })
    expect(result).toMatchObject({ ingredient: "egg", swaps: [], none: expect.stringMatching(/star of the dish/) })
    expect(askAiJson).not.toHaveBeenCalled()
  })

  it("asks the AI to pick from the table for the egg in banana muffins, and drops what clashes with the diet", async () => {
    loadSubstitutionRecipe.mockResolvedValue({
      title: "Banana muffins",
      ingredients: [
        { original: "2 bananas", name: "banana" },
        { original: "1 egg", name: "egg" },
      ],
      from: "cache",
    })
    getMyPreferences.mockResolvedValue({ ...NO_PREFS, diet: "vegan" })
    askAiJson.mockResolvedValue({
      ok: true,
      data: { role: "binder", swaps: [{ id: "yogurt" }, { id: "not-a-real-id" }, { id: "applesauce" }], none: null },
    })
    const result = await suggestSubstitutions({ ref: "715538", index: 1 })
    const messages = askAiJson.mock.calls[0][0] as ChatMessage[]
    const data = JSON.parse(messages[1].content.split("\n\n")[0])
    expect(data.candidates.map((c: { id: string }) => c.id)).toContain("flax-egg")
    expect(result).toMatchObject({ ingredient: "egg", none: null, swaps: [{ use: "applesauce", amount: "¼ cup per egg" }] })
    expect("swaps" in result && result.swaps).toHaveLength(1)
  })

  it("says no good swap when the AI names a role the ingredient doesn't play", async () => {
    loadSubstitutionRecipe.mockResolvedValue({
      title: "Banana muffins",
      ingredients: [{ original: "1 egg", name: "egg" }],
      from: "cache",
    })
    askAiJson.mockResolvedValue({ ok: true, data: { role: "garnish", swaps: [{ id: "banana" }], none: null } })
    const result = await suggestSubstitutions({ ref: "715538", index: 0 })
    expect(result).toMatchObject({ swaps: [], none: expect.any(String) })
  })

  it("treats broth as a supporting ingredient, not the main protein", async () => {
    loadSubstitutionRecipe.mockResolvedValue({
      title: "Mushroom risotto",
      ingredients: [{ original: "4 cups chicken broth", name: "chicken broth" }],
      from: "cache",
    })
    askAiJson.mockResolvedValue({ ok: true, data: { role: null, swaps: [], none: "Nothing fits." } })
    await suggestSubstitutions({ ref: "715538", index: 0 })
    expect(askAiJson).toHaveBeenCalledTimes(1)
  })
})
