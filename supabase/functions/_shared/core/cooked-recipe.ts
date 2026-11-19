// Generated from packages/core/src/activity/cooked-recipe.ts by scripts/sync-edge-shared.mjs. Edit the source, then rerun it.
// The recipe a "cooked" activity row is about, read from its details JSON. Its own file, free of
// imports, so the Edge Functions can use it (scripts/sync-edge-shared.mjs).

/** The recipe id ("123" for Spoonacular, a uuid for our own) and title, or null without a title. */
export function cookedRecipeOf(details: unknown): { id: string | null; title: string } | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null
  const fields = details as Record<string, unknown>
  const title = typeof fields.recipe_title === "string" ? fields.recipe_title.trim() : ""
  if (!title) return null
  const id =
    typeof fields.recipe_id === "number"
      ? String(fields.recipe_id)
      : typeof fields.local_recipe_id === "string" && /^[0-9a-f-]{36}$/i.test(fields.local_recipe_id)
        ? fields.local_recipe_id
        : null
  return { id, title }
}
