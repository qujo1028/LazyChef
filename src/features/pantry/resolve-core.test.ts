import { describe, expect, it, vi } from "vitest"

import type { CatalogEntry, Category, ParsedLine } from "@/lib/ingredients/types"

import {
  buildHouseholdKnowledge,
  NO_KEY_MESSAGE,
  planLookups,
  resolveParsedLines,
  type HouseholdKnowledge,
  type ResolveDeps,
  type SpoonacularLookup,
} from "./resolve-core"

// ── Fakes ────────────────────────────────────────────────────────────────────

const LIBRARY: Record<string, CatalogEntry> = {
  "chicken breast": { id: 5062, name: "chicken breast", category: "meat", aliases: [], units: ["lb"] },
  egg: { id: 1123, name: "egg", category: "dairy", aliases: [], units: ["count"] },
  "oat milk": { id: 93761, name: "oat milk", category: "beverages", aliases: [], units: ["cup"] },
  "house blend": { id: null, name: "house blend", category: "spices", aliases: [], units: [] },
}

/** Lowercase, trim, drop a trailing "s". */
const normalize = (name: string) => name.trim().toLowerCase().replace(/s$/, "")

const deps: ResolveDeps = {
  normalize,
  findIngredient: (name) => LIBRARY[normalize(name)] ?? null,
  guessCategory: (name): Category => (name.includes("sauce") ? "condiments" : "other"),
  categoryFromAisle: (aisle): Category =>
    aisle === "Produce" ? "produce" : aisle === "Ethnic Foods" ? "canned" : aisle === "Health Foods" ? "other" : "other",
}

function line(name: string, extra: Partial<ParsedLine> = {}): ParsedLine {
  return { raw: name, amountText: "", name, quantity: null, unit: "count", ...extra }
}

const noKnowledge: HouseholdKnowledge = { overrides: new Map(), pantry: new Map() }

function knowledge(
  overrides: [string, Category][] = [],
  pantry: { name: string; category: Category; ingredient_id: number | null }[] = [],
) {
  return buildHouseholdKnowledge(
    overrides.map(([ingredient_key, category]) => ({ ingredient_key, category })),
    pantry,
    normalize,
  )
}

function fakeLookup(answers: Record<string, { id: number | null; aisle: string | null } | null>, pointsLeft = 42) {
  return vi.fn(
    async (names: string[]): Promise<SpoonacularLookup> => ({
      ok: true,
      hits: names.map((name) => answers[name] ?? null),
      pointsLeft,
    }),
  )
}

// ── Household knowledge ──────────────────────────────────────────────────────

describe("buildHouseholdKnowledge", () => {
  it("keys pantry items by normalized name, newest first, filling a missing id from older rows", () => {
    const k = knowledge([], [
      { name: "Eggs", category: "dairy", ingredient_id: null },
      { name: "egg", category: "other", ingredient_id: 1123 },
    ])
    expect(k.pantry.get("egg")).toEqual({ category: "dairy", ingredientId: 1123 })
  })
})

// ── Priority chain ───────────────────────────────────────────────────────────

describe("resolveParsedLines", () => {
  it("uses the library and never calls Spoonacular when everything is known", async () => {
    const lookup = fakeLookup({})
    const result = await resolveParsedLines([line("chicken breast"), line("eggs")], {
      deps,
      knowledge: noKnowledge,
      lookup,
    })
    expect(result.items.map((i) => [i.category, i.categorySource, i.ingredientId])).toEqual([
      ["meat", "catalog", 5062],
      ["dairy", "catalog", 1123],
    ])
    expect(lookup).not.toHaveBeenCalled()
    expect(result.spoonacular).toEqual({ called: false, pointsLeft: null, error: null })
  })

  it("keeps the parser's fields (amount, unit, raw) untouched", async () => {
    const parsed = line("chicken breast", { raw: "2 lbs chicken breast", amountText: "2 lbs ", quantity: 2, unit: "lb" })
    const lookup = fakeLookup({ "chicken breast": { id: 1, aisle: "Produce" } })
    const [item] = (await resolveParsedLines([parsed], { deps, knowledge: noKnowledge, lookup })).items
    expect(item).toMatchObject({ raw: "2 lbs chicken breast", amountText: "2 lbs ", quantity: 2, unit: "lb", name: "chicken breast" })
  })

  it("lets a household override beat the library's category but keeps the library's ingredient id", async () => {
    const result = await resolveParsedLines([line("oat milk")], {
      deps,
      knowledge: knowledge([["oat milk", "dairy"]]),
      lookup: null,
    })
    expect(result.items[0]).toMatchObject({ category: "dairy", categorySource: "household", ingredientId: 93761 })
    expect(result.spoonacular.error).toBeNull()
  })

  it("lets an override beat an existing pantry item (whose id is still used when the library has none)", async () => {
    const result = await resolveParsedLines([line("gochujang")], {
      deps,
      knowledge: knowledge([["gochujang", "condiments"]], [{ name: "Gochujang", category: "canned", ingredient_id: 777 }]),
      lookup: fakeLookup({}),
    })
    expect(result.items[0]).toMatchObject({ category: "condiments", categorySource: "household", ingredientId: 777 })
  })

  it("reuses the category and id of an item already in the pantry", async () => {
    const lookup = fakeLookup({})
    const result = await resolveParsedLines([line("gochujang")], {
      deps,
      knowledge: knowledge([], [{ name: "gochujang", category: "condiments", ingredient_id: 777 }]),
      lookup,
    })
    expect(result.items[0]).toMatchObject({ category: "condiments", categorySource: "household", ingredientId: 777 })
    expect(lookup).not.toHaveBeenCalled()
  })

  it("prefers an existing pantry item's category over the library", async () => {
    const result = await resolveParsedLines([line("oat milk")], {
      deps,
      knowledge: knowledge([], [{ name: "oat milk", category: "dairy", ingredient_id: null }]),
      lookup: null,
    })
    expect(result.items[0]).toMatchObject({ category: "dairy", categorySource: "household", ingredientId: 93761 })
  })

  it("keeps a library entry without a Spoonacular id", async () => {
    const result = await resolveParsedLines([line("house blend")], { deps, knowledge: noKnowledge, lookup: null })
    expect(result.items[0]).toMatchObject({ category: "spices", categorySource: "catalog", ingredientId: null })
  })

  it("asks Spoonacular only about unknown names, once per key", async () => {
    const lookup = fakeLookup({ gochujang: { id: 777, aisle: "Ethnic Foods" }, kohlrabi: { id: 888, aisle: "Produce" } })
    const result = await resolveParsedLines(
      [line("gochujang"), line("eggs"), line("kohlrabi"), line("Gochujang "), line("kohlrabis")],
      { deps, knowledge: noKnowledge, lookup },
    )
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(lookup).toHaveBeenCalledWith(["gochujang", "kohlrabi"])
    expect(result.items.map((i) => [i.category, i.categorySource, i.ingredientId])).toEqual([
      ["canned", "spoonacular", 777],
      ["dairy", "catalog", 1123],
      ["produce", "spoonacular", 888],
      ["canned", "spoonacular", 777],
      ["produce", "spoonacular", 888],
    ])
    expect(result.spoonacular).toEqual({ called: true, pointsLeft: 42, error: null })
  })

  it("caps the lookup and falls back for names past the cap", async () => {
    const names = ["a1", "b2", "c3", "d4"]
    const lookup = fakeLookup(Object.fromEntries(names.map((n) => [n, { id: 1, aisle: "Produce" }])))
    const result = await resolveParsedLines(names.map((n) => line(n)), {
      deps,
      knowledge: noKnowledge,
      lookup,
      maxLookups: 2,
    })
    expect(lookup).toHaveBeenCalledWith(["a1", "b2"])
    expect(result.items.map((i) => i.categorySource)).toEqual(["spoonacular", "spoonacular", "fallback", "fallback"])
  })

  it("falls back to the keyword guess when Spoonacular doesn't know a name", async () => {
    const result = await resolveParsedLines([line("mystery sauce"), line("zzz")], {
      deps,
      knowledge: noKnowledge,
      lookup: fakeLookup({ zzz: { id: null, aisle: null } }),
    })
    expect(result.items.map((i) => [i.category, i.categorySource, i.ingredientId])).toEqual([
      ["condiments", "fallback", null],
      ["other", "fallback", null],
    ])
  })

  it("prefers a keyword guess over Spoonacular's 'other' aisle, keeping Spoonacular's id", async () => {
    const result = await resolveParsedLines([line("hot sauce"), line("spirulina")], {
      deps,
      knowledge: noKnowledge,
      lookup: fakeLookup({
        "hot sauce": { id: 6168, aisle: "Health Foods" },
        spirulina: { id: 11667, aisle: "Health Foods" },
      }),
    })
    expect(result.items.map((i) => [i.category, i.categorySource, i.ingredientId])).toEqual([
      ["condiments", "fallback", 6168],
      ["other", "spoonacular", 11667],
    ])
  })

  it("reports Spoonacular errors and falls back", async () => {
    const lookup = vi.fn(async (): Promise<SpoonacularLookup> => ({ ok: false, error: "Quota used up." }))
    const result = await resolveParsedLines([line("mystery sauce")], { deps, knowledge: noKnowledge, lookup })
    expect(result.items[0]).toMatchObject({ category: "condiments", categorySource: "fallback" })
    expect(result.spoonacular).toEqual({ called: true, pointsLeft: null, error: "Quota used up." })
  })

  it("survives a lookup that throws", async () => {
    const lookup = vi.fn(async (): Promise<SpoonacularLookup> => {
      throw new Error("boom")
    })
    const result = await resolveParsedLines([line("zzz")], { deps, knowledge: noKnowledge, lookup })
    expect(result.items[0].categorySource).toBe("fallback")
    expect(result.spoonacular.called).toBe(true)
    expect(result.spoonacular.error).toMatch(/Spoonacular/)
  })

  it("explains the missing key only when something is unknown", async () => {
    const unknown = await resolveParsedLines([line("zzz")], { deps, knowledge: noKnowledge, lookup: null })
    expect(unknown.spoonacular).toEqual({ called: false, pointsLeft: null, error: NO_KEY_MESSAGE })

    const known = await resolveParsedLines([line("eggs")], { deps, knowledge: noKnowledge, lookup: null })
    expect(known.spoonacular).toEqual({ called: false, pointsLeft: null, error: null })
  })
})

describe("planLookups", () => {
  it("de-duplicates by key, keeps order and skips empty names", () => {
    const plan = planLookups(
      [
        { line: line("Kale"), key: "kale" },
        { line: line(""), key: "" },
        { line: line("kales"), key: "kale" },
        { line: line("tahini"), key: "tahini" },
      ],
      20,
    )
    expect(plan).toEqual({ keys: ["kale", "tahini"], names: ["Kale", "tahini"] })
  })
})
