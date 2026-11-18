import "server-only"

// Substitution pipeline: vetted candidates -> pantry marking -> AI picks among candidate ids
// only -> server-side filters (known id, role covered). Callers re-check auth first.
import { z } from "zod"

import { askAiJson } from "@/lib/llm/ai"
import { lookupSubstitutions, ROLES, type Allergen, type Role, type SubOption } from "@/lib/ingredients/substitutions"

import { findInPantry, type PantryIndex } from "./match"

export type Swap = {
  id: string
  name: string
  ratio: string
  note: string
  /** The AI's reason, when it gave a usable one. */
  why: string | null
  allergens: readonly Allergen[]
  inPantry: boolean
}

export type SwapResult =
  | { status: "ok"; role: Role; swaps: Swap[] }
  | { status: "none"; reason: string }
  | { status: "error"; message: string }

const reply = z.object({
  role: z.enum(ROLES).nullable(),
  picks: z.array(z.object({ id: z.string().max(60), why: z.string().max(200).optional() })).max(5),
})

const NO_MAIN = "This is the star of the dish, so swapping it would make a different recipe."
const NO_ENTRY = "There's no swap we trust for this one."
const NO_FIT = "Nothing we know of would work well here."

const SYSTEM = `You help a home cook swap ONE ingredient in a recipe. You will get the recipe title, the ingredient, the roles it might play, and a numbered list of vetted candidate swaps with ids.
Rules:
- Decide which single role the ingredient plays in this recipe (one of the listed roles), or null if none fits.
- Choose at most 3 candidates that cover that role and suit this recipe, best first. Use only ids from the list. Never invent a substitute.
- If no candidate is a good fit, return an empty picks list. Saying there is no good swap is correct and expected when unsure.
- Reply with JSON only: {"role": "<role or null>", "picks": [{"id": "<candidate id>", "why": "<one short sentence for this recipe>"}]}`

export async function suggestSwaps(input: {
  ingredientName: string
  recipeTitle: string
  pantry: PantryIndex
}): Promise<SwapResult> {
  const found = lookupSubstitutions(input.ingredientName)
  if (found.kind === "main") return { status: "none", reason: NO_MAIN }
  if (found.kind === "none") return { status: "none", reason: NO_ENTRY }
  const { entry } = found

  // Candidates come only from the table. Pantry first, store-bought after.
  const candidates = entry.options
    .map((option) => ({ option, inPantry: findInPantry(input.pantry, { id: null, name: option.name }) !== null }))
    .sort((a, b) => Number(b.inPantry) - Number(a.inPantry))

  const list = candidates
    .map(({ option, inPantry }, i) => `${i + 1}. id=${option.id} | ${option.name} | covers: ${option.covers.join(", ")} | ${option.note}${inPantry ? " | in pantry" : ""}`)
    .join("\n")

  const ai = await askAiJson(
    [
      { role: "system", content: `${SYSTEM}\n\nCandidates:\n${list}` },
      {
        role: "user",
        content: `Recipe: ${input.recipeTitle.slice(0, 120)}\nIngredient: ${input.ingredientName.slice(0, 80)}\nPossible roles: ${entry.roles.join(", ")}`,
      },
    ],
    reply,
    { maxTokens: 400, temperature: 0.2 },
  )
  if (!ai.ok) return { status: "error", message: ai.error }

  // Re-validate: never trust the shape (or the ids) that came back.
  const parsed = reply.safeParse(ai.data)
  if (!parsed.success || parsed.data.role === null) return { status: "none", reason: NO_FIT }
  const { role, picks } = parsed.data
  // Role check: the recipe role must be one the ingredient can play.
  if (!entry.roles.includes(role)) return { status: "none", reason: NO_FIT }

  const byId = new Map<string, { option: SubOption; inPantry: boolean }>(candidates.map((c) => [c.option.id, c]))
  const seen = new Set<string>()
  const swaps: Swap[] = []
  for (const pick of picks) {
    const hit = byId.get(pick.id)
    if (!hit || seen.has(pick.id)) continue
    // ...and the swap must cover that role.
    if (!hit.option.covers.includes(role)) continue
    seen.add(pick.id)
    swaps.push({
      id: hit.option.id,
      name: hit.option.name,
      ratio: hit.option.ratio,
      note: hit.option.note,
      why: pick.why?.trim() || null,
      allergens: hit.option.allergens ?? [],
      inPantry: hit.inPantry,
    })
  }
  if (swaps.length === 0) return { status: "none", reason: NO_FIT }
  swaps.sort((a, b) => Number(b.inPantry) - Number(a.inPantry))
  return { status: "ok", role, swaps }
}
