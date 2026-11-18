import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
const askAiJson = vi.fn()
vi.mock("@/lib/llm/ai", () => ({ askAiJson: (...args: unknown[]) => askAiJson(...args) }))

const { suggestSwaps } = await import("./substitute")
const { buildPantryIndex } = await import("./match")
const { lookupSubstitutions } = await import("@/lib/ingredients/substitutions")

const TODAY = "2026-11-17"
const pantry = (...names: string[]) =>
  buildPantryIndex(
    names.map((name) => ({ name, quantity: 1, ingredient_id: null, is_staple: false, expires_on: null })),
    TODAY,
  )
const run = (ingredientName: string, recipeTitle: string, names: string[] = []) =>
  suggestSwaps({ ingredientName, recipeTitle, pantry: pantry(...names) })

beforeEach(() => askAiJson.mockReset())

describe("lookupSubstitutions", () => {
  it("finds aliases but never suffix-matches", () => {
    expect(lookupSubstitutions("unsalted butter").kind).toBe("options")
    expect(lookupSubstitutions("flour").kind).toBe("options")
    expect(lookupSubstitutions("peanut butter").kind).not.toBe("options")
  })
  it("does not treat broth, stock or seasoning as the main ingredient", () => {
    expect(lookupSubstitutions("chicken broth").kind).toBe("options")
    expect(lookupSubstitutions("beef stock").kind).toBe("none")
    expect(lookupSubstitutions("chicken bouillon").kind).toBe("none")
    expect(lookupSubstitutions("chicken seasoning").kind).toBe("none")
  })
  it("treats main proteins as no-swap", () => {
    expect(lookupSubstitutions("ribeye steak").kind).toBe("main")
    expect(lookupSubstitutions("chicken breast").kind).toBe("main")
  })
})

describe("suggestSwaps", () => {
  it("refuses a main protein without asking the AI", async () => {
    const result = await run("ribeye steak", "Garlic Butter Steak")
    expect(result.status).toBe("none")
    expect(askAiJson).not.toHaveBeenCalled()
  })

  it("refuses an ingredient the recipe is named for, without asking the AI", async () => {
    expect((await run("eggs", "Cheese Omelette")).status).toBe("none")
    expect((await run("egg", "Egg Fried Rice")).status).toBe("none")
    expect((await run("butter", "Butter Chicken")).status).toBe("none")
    expect(askAiJson).not.toHaveBeenCalled()
  })

  it("still asks the AI for an ingredient the title doesn't name", async () => {
    askAiJson.mockResolvedValue({ ok: true, data: { role: "binder", picks: [{ id: "banana" }] } })
    expect((await run("egg", "Banana Muffins")).status).toBe("ok")
    expect(askAiJson).toHaveBeenCalledTimes(1)
  })

  it("refuses an ingredient with no vetted entry without asking the AI", async () => {
    expect((await run("saffron", "Paella")).status).toBe("none")
    expect(askAiJson).not.toHaveBeenCalled()
  })

  it("returns swaps the AI picked from the list, pantry first", async () => {
    askAiJson.mockResolvedValue({
      ok: true,
      data: { role: "binder", picks: [{ id: "flax-egg", why: "Good in cookies." }, { id: "applesauce" }] },
    })
    const result = await run("eggs", "Oatmeal Cookies", ["applesauce"])
    expect(result).toMatchObject({ status: "ok", role: "binder" })
    if (result.status !== "ok") return
    expect(result.swaps.map((s) => s.id)).toEqual(["applesauce", "flax-egg"])
    expect(result.swaps[0].inPantry).toBe(true)
    expect(result.swaps[1].inPantry).toBe(false)
    expect(result.swaps[1].why).toBe("Good in cookies.")
  })

  it("drops ids that are not in the candidate list; all dropped -> refused", async () => {
    askAiJson.mockResolvedValue({ ok: true, data: { role: "binder", picks: [{ id: "unicorn-tears" }, { id: "banana-split" }] } })
    expect((await run("egg", "Brownies")).status).toBe("none")
  })

  it("keeps only the valid ids", async () => {
    askAiJson.mockResolvedValue({ ok: true, data: { role: "binder", picks: [{ id: "nonsense" }, { id: "banana" }] } })
    const result = await run("egg", "Pancakes")
    expect(result.status === "ok" && result.swaps.map((s) => s.id)).toEqual(["banana"])
  })

  it("refuses nonsense replies", async () => {
    askAiJson.mockResolvedValue({ ok: true, data: { foo: "bar" } })
    expect((await run("butter", "Shortbread")).status).toBe("none")
    askAiJson.mockResolvedValue({ ok: true, data: "use a rock" })
    expect((await run("butter", "Shortbread")).status).toBe("none")
  })

  it("accepts the AI saying there is no good swap", async () => {
    askAiJson.mockResolvedValue({ ok: true, data: { role: null, picks: [] } })
    expect((await run("egg", "Souffle")).status).toBe("none")
  })

  it("rejects a role the ingredient doesn't play", async () => {
    askAiJson.mockResolvedValue({ ok: true, data: { role: "sweetener", picks: [{ id: "applesauce" }] } })
    expect((await run("egg", "Cake")).status).toBe("none")
  })

  it("rejects a swap that does not cover the recipe role", async () => {
    // Applesauce binds but does not leaven.
    askAiJson.mockResolvedValue({ ok: true, data: { role: "leavening", picks: [{ id: "applesauce" }] } })
    expect((await run("egg", "Meringues")).status).toBe("none")
    // Flour as structure has no covering swap; as thickener cornstarch does.
    askAiJson.mockResolvedValue({ ok: true, data: { role: "structure", picks: [{ id: "cornstarch" }] } })
    expect((await run("flour", "Bread")).status).toBe("none")
    askAiJson.mockResolvedValue({ ok: true, data: { role: "thickener", picks: [{ id: "cornstarch" }] } })
    expect((await run("flour", "Gravy")).status).toBe("ok")
  })

  it("passes AI errors through", async () => {
    askAiJson.mockResolvedValue({ ok: false, error: "busy" })
    expect(await run("egg", "Cake")).toEqual({ status: "error", message: "busy" })
  })

  it("only offers candidates from the table in the prompt", async () => {
    askAiJson.mockResolvedValue({ ok: true, data: { role: null, picks: [] } })
    await run("butter", "Cookies")
    const system = askAiJson.mock.calls[0][0][0].content as string
    expect(system).toContain("id=olive-oil")
    expect(system).not.toContain("id=applesauce")
  })
})
