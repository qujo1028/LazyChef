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

  it("passes on the AI's friendly error", async () => {
    getPantryItems.mockResolvedValue([row("eggs")])
    askAiJson.mockResolvedValue({ ok: false, error: "The AI assistant is busy right now. Try again in a minute." })
    expect(await getAiRecipeIdea("")).toEqual({ error: "The AI assistant is busy right now. Try again in a minute." })
  })
})
