import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

// Mocked Spoonacular: no key or network needed.
const QUOTA = { "X-API-Quota-Request": "1.4", "X-API-Quota-Used": "3.4", "X-API-Quota-Left": "46.6" }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...QUOTA } })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.resetModules()
  fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
  vi.stubEnv("SPOONACULAR_API_KEY", "test-key")
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const summary = {
  id: 1,
  title: "Egg Fried Rice",
  image: "https://img.spoonacular.com/recipes/1-312x231.jpg",
  usedIngredients: [{ id: 1123, name: "eggs", original: "2 eggs", amount: 2, unit: "" }],
  missedIngredients: [{ id: 11291, name: "scallions", original: "2 scallions", amount: 2, unit: "", aisle: "Produce" }],
}

describe("findRecipesByIngredients", () => {
  it("ranks by fewest missing and ignores pantry basics", async () => {
    fetchMock.mockResolvedValue(json([summary]))
    const { findRecipesByIngredients } = await import("./recipes")
    const { recipes, quota } = await findRecipesByIngredients(["eggs", "rice"], 40)

    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.pathname).toBe("/recipes/findByIngredients")
    expect(Object.fromEntries(url.searchParams)).toEqual({ ingredients: "eggs,rice", number: "40", ranking: "2", ignorePantry: "true" })
    expect(recipes[0]).toMatchObject({ id: 1, title: "Egg Fried Rice", missed: [{ name: "scallions" }] })
    expect(quota.left).toBe(46.6)
  })
})

describe("searchRecipes", () => {
  it("uses includeIngredients and fillIngredients with the filters", async () => {
    fetchMock.mockResolvedValue(json({ results: [{ ...summary, readyInMinutes: 20, servings: 2 }] }))
    const { searchRecipes, searchCost } = await import("./recipes")
    const { recipes } = await searchRecipes({ ingredients: ["eggs", "rice"], type: "breakfast", maxReadyTime: 30, number: 20 })

    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.pathname).toBe("/recipes/complexSearch")
    const params = Object.fromEntries(url.searchParams)
    expect(params).toMatchObject({
      includeIngredients: "eggs,rice",
      fillIngredients: "true",
      addRecipeInformation: "true",
      type: "breakfast",
      maxReadyTime: "30",
      number: "20",
    })
    expect(params.addRecipeInstructions).toBeUndefined()
    expect(recipes[0].readyInMinutes).toBe(20)
    expect(searchCost(20)).toBe(2.2)
  })
})

describe("getRecipeInformation", () => {
  it("falls back to Spoonacular's page when there's no source link", async () => {
    fetchMock.mockResolvedValue(
      json({ id: 1, title: "Soup", spoonacularSourceUrl: "https://spoonacular.com/soup-1", extendedIngredients: [] }),
    )
    const { getRecipeInformation } = await import("./recipes")
    const { recipe } = await getRecipeInformation(1)
    expect(recipe.sourceUrl).toBe("https://spoonacular.com/soup-1")
  })

  it("a 402 is a quota error", async () => {
    fetchMock.mockResolvedValue(json({ message: "limit" }, 402))
    const { getRecipeInformation } = await import("./recipes")
    await expect(getRecipeInformation(2)).rejects.toMatchObject({ code: "quota", status: 402 })
  })
})
