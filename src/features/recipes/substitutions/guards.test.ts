import { describe, expect, it } from "vitest"

import { lookupSubstitutions } from "@lazychef/core/ingredients/substitutions"

import { buildPantryIndex } from "@lazychef/core/recipes/match"
import { NO_DIET_SWAP, NO_GOOD_SWAP, planSubstitution, plausibleSwap, STAR_OF_THE_DISH } from "./guards"
import { buildTableMessages, finalizeSubstitutions, finalizeTableSwaps, substitutionReplySchema, tableReplySchema } from "./prompt"

const TODAY = "2026-11-10"
const item = (name: string) => ({ name, quantity: 1, ingredient_id: null, is_staple: false, expires_on: null })
const pantry = buildPantryIndex([item("bananas"), item("olive oil")], TODAY)

function eggEntry() {
  const found = lookupSubstitutions("egg")
  if (found.kind !== "options") throw new Error("egg should be in the table")
  return found.entry
}

describe("planSubstitution", () => {
  it("refuses the protein a dish is built on", () => {
    expect(planSubstitution("ribeye steak", "Pan-seared steak")).toEqual({ kind: "refuse", reason: STAR_OF_THE_DISH })
    expect(planSubstitution("chicken thighs", "Weeknight curry")).toEqual({ kind: "refuse", reason: STAR_OF_THE_DISH })
  })

  it("refuses what the recipe is named for", () => {
    expect(planSubstitution("egg", "Cheese Omelette").kind).toBe("refuse")
    expect(planSubstitution("butter", "Butter Chicken").kind).toBe("refuse")
    expect(planSubstitution("pumpkin", "Pumpkin pie").kind).toBe("refuse")
  })

  it("uses the table when the ingredient is a supporting player", () => {
    const plan = planSubstitution("egg", "Banana muffins")
    expect(plan.kind).toBe("table")
  })

  it("doesn't treat broth or stock as the main protein", () => {
    expect(planSubstitution("chicken broth", "Mushroom risotto").kind).toBe("table")
    expect(planSubstitution("beef stock", "French onion soup").kind).toBe("free")
  })

  it("falls back to a free-form answer for anything else", () => {
    expect(planSubstitution("gochujang", "Spicy noodles")).toEqual({ kind: "free" })
  })
})

describe("plausibleSwap", () => {
  it("keeps swaps from the same kind of food", () => {
    expect(plausibleSwap("cumin", "smoked paprika")).toBe(true)
    expect(plausibleSwap("fresh basil", "dried basil")).toBe(true)
    expect(plausibleSwap("sriracha", "red pepper flakes")).toBe(true)
    expect(plausibleSwap("buttermilk", "milk + lemon juice")).toBe(true)
    expect(plausibleSwap("quinoa", "rice")).toBe(true)
  })

  it("rejects proteins, the ingredient itself and different kinds of food", () => {
    expect(plausibleSwap("gochujang", "chorizo")).toBe(false)
    expect(plausibleSwap("rice", "tofu")).toBe(false)
    expect(plausibleSwap("cumin", "cumin")).toBe(false)
    expect(plausibleSwap("cumin", "apple")).toBe(false)
    expect(plausibleSwap("mozzarella", "rice")).toBe(false)
    expect(plausibleSwap("cumin", "")).toBe(false)
  })
})

describe("finalizeTableSwaps", () => {
  const entry = eggEntry()

  it("puts the candidate ids in the prompt, pantry first", () => {
    const messages = buildTableMessages(
      { title: "Banana muffins", lines: ["2 eggs"], target: "2 eggs", pantry: ["bananas"] },
      entry,
      pantry,
    )
    const data = JSON.parse(messages[1].content.split("\n\n")[0])
    expect(data.roles).toEqual(["binder", "leavening"])
    expect(data.candidates[0]).toMatchObject({ id: "banana", inPantry: true })
    expect(data.candidates.map((c: { id: string }) => c.id).sort()).toEqual(entry.options.map((o) => o.id).sort())
  })

  it("drops ids that aren't in the list and swaps that don't cover the role", () => {
    const reply = tableReplySchema.parse({
      role: "leavening",
      swaps: [{ id: "chicken-breast" }, { id: "applesauce" }, { id: "aquafaba" }, "junk"],
    })
    const answer = finalizeTableSwaps(reply, { entry, pantry })
    // applesauce only binds; aquafaba covers leavening; the made-up id is ignored.
    expect(answer.swaps.map((swap) => swap.use)).toEqual(["chickpea liquid (aquafaba)"])
    expect(answer.none).toBeNull()
  })

  it("says no good swap for a role the ingredient doesn't play", () => {
    const reply = tableReplySchema.parse({ role: "crunchiness", swaps: [{ id: "banana" }] })
    expect(finalizeTableSwaps(reply, { entry, pantry })).toEqual({ swaps: [], none: NO_GOOD_SWAP })
  })

  it("uses the table's amounts and notes, puts pantry swaps first and shows allergens", () => {
    const reply = tableReplySchema.parse({ role: "binder", swaps: [{ id: "yogurt" }, { id: "banana" }] })
    const answer = finalizeTableSwaps(reply, { entry, pantry })
    expect(answer.swaps.map((swap) => [swap.use, swap.pantryName, swap.allergens])).toEqual([
      ["banana", "bananas", []],
      ["plain yogurt", null, ["dairy"]],
    ])
    expect(answer.swaps[0].amount).toBe("¼ cup mashed per egg")
  })

  it("drops swaps that clash with the viewer's diet", () => {
    const reply = tableReplySchema.parse({ role: "binder", swaps: [{ id: "yogurt" }, { id: "flax-egg" }] })
    const vegan = { diet: "vegan" as const, allergies: [] }
    expect(finalizeTableSwaps(reply, { entry, pantry, prefs: vegan }).swaps.map((s) => s.use)).toEqual(["ground flaxseed"])
    const onlyYogurt = tableReplySchema.parse({ role: "binder", swaps: [{ id: "yogurt" }] })
    expect(finalizeTableSwaps(onlyYogurt, { entry, pantry, prefs: vegan })).toEqual({ swaps: [], none: NO_DIET_SWAP })
  })
})

describe("finalizeSubstitutions guards", () => {
  it("drops implausible free-form swaps and says so when none are left", () => {
    const reply = substitutionReplySchema.parse({
      swaps: [
        { use: "chorizo", amount: "1:1", note: "Smoky." },
        { use: "apple", amount: "1", note: "Sweet." },
      ],
    })
    expect(finalizeSubstitutions(reply, { target: "cumin", pantry })).toEqual({ swaps: [], none: NO_GOOD_SWAP })
  })

  it("drops free-form swaps that clash with the viewer's allergies", () => {
    const reply = substitutionReplySchema.parse({
      swaps: [
        { use: "peanut butter", amount: "1:1", note: "Nutty." },
        { use: "tahini", amount: "1:1", note: "Earthy." },
      ],
    })
    const answer = finalizeSubstitutions(reply, {
      target: "almond butter",
      pantry,
      prefs: { diet: "none", allergies: ["peanut"] },
    })
    expect(answer.swaps.map((swap) => swap.use)).toEqual(["tahini"])
  })
})
