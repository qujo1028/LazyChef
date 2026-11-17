import { afterEach, describe, expect, it, vi } from "vitest"

import type { ChatMessage } from "@/lib/llm/client"

vi.mock("server-only", () => ({}))

const requireViewer = vi.fn(async () => ({ id: "user-1", email: null }))
const requireHousehold = vi.fn(async () => ({ household: { id: "house-1" } }))
vi.mock("@/features/household/queries", () => ({
  requireViewer: () => requireViewer(),
  requireHousehold: () => requireHousehold(),
}))

type Row = { name: string; quantity: number | null; is_staple: boolean; expires_on: string | null; ingredient_id: null }
const getPantryItems = vi.fn<(householdId: string) => Promise<Row[]>>()
vi.mock("@/features/pantry/queries", () => ({ getPantryItems: (id: string) => getPantryItems(id) }))

type Prefs = { diet: string; allergies: string[]; cuisines: string[]; worldRecipes: boolean }
const NONE: Prefs = { diet: "none", allergies: [], cuisines: [], worldRecipes: false }
const getMyPreferences = vi.fn(async (): Promise<Prefs> => NONE)
vi.mock("@/features/preferences/queries", () => ({ getMyPreferences: () => getMyPreferences() }))

const askAiJson = vi.fn<(messages: ChatMessage[], schema: unknown, options: unknown) => Promise<unknown>>()
vi.mock("@/lib/llm/ai", () => ({
  askAiJson: (messages: ChatMessage[], schema: unknown, options: unknown) => askAiJson(messages, schema, options),
}))

const { getAiRecipeIdea } = await import("./actions")

const row = (name: string, expires_on: string | null = null, quantity: number | null = 1): Row => ({
  name,
  quantity,
  is_staple: false,
  expires_on,
  ingredient_id: null,
})

const recipe = {
  title: "Spinach omelette",
  description: "",
  servings: 2,
  minutes: 10,
  ingredients: [
    { name: "eggs", amount: "4", fromPantry: true },
    { name: "spinach", amount: "1 bag", fromPantry: false },
    { name: "feta", amount: "50 g", fromPantry: false },
  ],
  steps: ["Cook."],
}

afterEach(() => vi.clearAllMocks())

describe("getAiRecipeIdea", () => {
  it("sends the household's own pantry, soonest-expiring first, and skips what ran out", async () => {
    getPantryItems.mockResolvedValue([row("eggs"), row("milk", null, 0), row("spinach", "2000-01-01")])
    askAiJson.mockResolvedValue({ ok: true, data: recipe })

    const result = await getAiRecipeIdea("quick")

    expect(requireViewer).toHaveBeenCalled()
    expect(getPantryItems).toHaveBeenCalledWith("house-1")
    const [messages] = askAiJson.mock.calls[0]
    expect(messages[1].content).toContain('["spinach","eggs"]')
    expect(messages[1].content).toContain('"quick"')
    expect(result).toEqual({
      recipe: { ...recipe, ingredients: recipe.ingredients.map((i) => ({ ...i, fromPantry: i.name !== "feta" })) },
      missing: ["feta"],
    })
  })

  it("caps the names at 40", async () => {
    getPantryItems.mockResolvedValue(Array.from({ length: 70 }, (_, i) => row(`item ${i}`)))
    askAiJson.mockResolvedValue({ ok: true, data: recipe })
    await getAiRecipeIdea("")
    const sent = JSON.parse(askAiJson.mock.calls[0][0][1].content.match(/(\[.*\])/)![1]) as string[]
    expect(sent).toHaveLength(40)
  })

  it("doesn't ask with an empty pantry or a long hint", async () => {
    getPantryItems.mockResolvedValue([])
    expect(await getAiRecipeIdea("")).toEqual({ error: "Add a few things to your pantry first." })
    expect((await getAiRecipeIdea("x".repeat(101))).error).toBeTruthy()
    expect(askAiJson).not.toHaveBeenCalled()
  })

  it("follows the viewer's diet: conflicting items aren't sent, the AI is told, and its answer is checked", async () => {
    getMyPreferences.mockResolvedValueOnce({ ...NONE, diet: "vegetarian", allergies: ["peanut"] })
    getPantryItems.mockResolvedValue([row("eggs"), row("chicken thighs"), row("peanut butter"), row("spinach")])
    const chicken = { ...recipe, ingredients: [...recipe.ingredients, { name: "chicken stock", amount: "1 cup", fromPantry: false }] }
    askAiJson.mockResolvedValueOnce({ ok: true, data: chicken }).mockResolvedValueOnce({ ok: true, data: recipe })

    const result = await getAiRecipeIdea("")

    const content = askAiJson.mock.calls[0][0][1].content
    expect(content).toContain('["eggs","spinach"]')
    expect(content).toContain('Dietary needs: "Vegetarian; allergic to: peanut"')
    // The first answer used chicken stock, so it asked once more.
    expect(askAiJson).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({ recipe: { title: "Spinach omelette" } })
  })

  it("gives up after two answers that break the diet", async () => {
    getMyPreferences.mockResolvedValueOnce({ ...NONE, diet: "vegan" })
    getPantryItems.mockResolvedValue([row("spinach")])
    askAiJson.mockResolvedValue({ ok: true, data: recipe })
    expect(await getAiRecipeIdea("")).toEqual({ error: "That idea didn't fit your diet. Try again." })
    expect(askAiJson).toHaveBeenCalledTimes(2)
  })

  it("says so when nothing in the pantry fits the diet", async () => {
    getMyPreferences.mockResolvedValueOnce({ ...NONE, diet: "vegetarian" })
    getPantryItems.mockResolvedValue([row("bacon")])
    expect((await getAiRecipeIdea("")).error).toMatch(/fits your diet/)
    expect(askAiJson).not.toHaveBeenCalled()
  })

  it("passes on the AI's friendly error", async () => {
    getPantryItems.mockResolvedValue([row("eggs")])
    askAiJson.mockResolvedValue({ ok: false, error: "The AI assistant is busy right now. Try again in a minute." })
    expect(await getAiRecipeIdea("")).toEqual({ error: "The AI assistant is busy right now. Try again in a minute." })
  })
})
