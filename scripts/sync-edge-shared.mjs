// Copies the pure modules the Edge Functions share with the apps into supabase/functions/_shared/core/.
// The Supabase bundler only reliably resolves files under supabase/functions, and Deno needs
// explicit ".ts" import paths, so the functions get generated copies instead of importing
// packages/core directly. A Vitest test fails when a copy is stale.
//
//   node scripts/sync-edge-shared.mjs          write the copies
//   node scripts/sync-edge-shared.mjs --check  exit 1 if any copy is out of date
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")

export const SHARED_DIR = "supabase/functions/_shared/core"

/** Source file (from the repo root) to its copy's name in SHARED_DIR. */
export const COPIES = {
  "packages/core/src/recipes/recipe-shapes.ts": "recipe-shapes.ts",
  "packages/core/src/recipes/edge-contract.ts": "edge-contract.ts",
  "packages/core/src/ai/edge-contract.ts": "ai-contract.ts",
  "packages/core/src/ingredients/library/normalize.ts": "normalize.ts",
  "src/lib/spoonacular/cost.ts": "cost.ts",
  // The `ai` function's meal ideas (and the small modules they import).
  "packages/core/src/recipes/ai/idea.ts": "ai-idea.ts",
  "packages/core/src/recipes/ai/meal-ideas.ts": "ai-meal-ideas.ts",
  "packages/core/src/recipes/ai-limits.ts": "ai-limits.ts",
  "packages/core/src/recipes/basics.ts": "basics.ts",
  "packages/core/src/recipes/pantry-names.ts": "pantry-names.ts",
  "packages/core/src/recipes/taste-hints.ts": "taste-hints.ts",
  "packages/core/src/preferences/diet.ts": "diet.ts",
  "packages/core/src/preferences/options.ts": "options.ts",
  "packages/core/src/dates/days.ts": "days.ts",
  "packages/core/src/activity/cooked-recipe.ts": "cooked-recipe.ts",
  "packages/core/src/pro/ai-allowance-core.ts": "ai-allowance-core.ts",
}

/**
 * The copy's expected text: a header, then the source with each relative import pointed at its
 * copy ("../../preferences/diet" becomes "./diet.ts"), since the copies sit side by side. A
 * relative import of a file that isn't copied throws, so a copy never points at nothing. Bare
 * imports ("zod") are left for the function's deno.json import map.
 */
export function expectedCopy(source) {
  const text = readFileSync(path.join(root, source), "utf8")
  const copied = text.replace(/(from\s+["'])(\.{1,2}\/[^"']+?)(["'])/g, (match, open, specifier, close) => {
    const target = path.posix.join(path.posix.dirname(source), specifier.endsWith(".ts") ? specifier : `${specifier}.ts`)
    const name = COPIES[target]
    if (!name) throw new Error(`${source} imports ${specifier}, which isn't in COPIES (scripts/sync-edge-shared.mjs).`)
    return `${open}./${name}${close}`
  })
  return `// Generated from ${source} by scripts/sync-edge-shared.mjs. Edit the source, then rerun it.\n${copied}`
}

/** Copies whose file doesn't match the source, as [source, copy path]. */
export function staleCopies() {
  return Object.entries(COPIES).flatMap(([source, name]) => {
    const target = path.join(root, SHARED_DIR, name)
    let current = null
    try {
      current = readFileSync(target, "utf8")
    } catch {
      // Missing counts as stale.
    }
    return current === expectedCopy(source) ? [] : [[source, path.join(SHARED_DIR, name)]]
  })
}

function main() {
  if (process.argv.includes("--check")) {
    const stale = staleCopies()
    for (const [source, copy] of stale) console.error(`${copy} is out of date with ${source}.`)
    if (stale.length > 0) {
      console.error("Run: node scripts/sync-edge-shared.mjs")
      process.exit(1)
    }
    return
  }
  mkdirSync(path.join(root, SHARED_DIR), { recursive: true })
  for (const [source, name] of Object.entries(COPIES)) {
    writeFileSync(path.join(root, SHARED_DIR, name), expectedCopy(source))
  }
  console.log(`Wrote ${Object.keys(COPIES).length} files to ${SHARED_DIR}.`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
