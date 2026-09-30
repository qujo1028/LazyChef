#!/usr/bin/env node
// Imports TheMealDB's recipes into the shared recipe library (recipes + recipe_ingredients,
// household_id null). Not part of the app: run it by hand after reviewing a dry run.
//
//   npm run recipes:import -- --dry-run            fetch everything, write a JSON preview, touch nothing
//   npm run recipes:import -- --dry-run --out x.json
//   npm run recipes:import -- --write              upsert into Supabase (safe to re-run)
//   npm run recipes:import -- --dry-run --from file.json   read meals from a saved response instead of the API
//
// Env (from the shell or .env.local):
//   THEMEALDB_API_KEY      TheMealDB key. "1" is their test key, for development only; a public app
//                          needs a supporter key. Never NEXT_PUBLIC_.
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY   only for --write (the secret key bypasses RLS,
//                          which is the only way to write the shared library).
//
// Images and source links stay TheMealDB's (linked, not copied); the app credits TheMealDB on
// every imported recipe.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

import "./lib/ts-paths.mjs"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const { convertMeals, mealsFromResponse } = await import(path.join(ROOT, "src/features/recipes/import/themealdb.ts"))

const { values: args } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    write: { type: "boolean", default: false },
    out: { type: "string", default: "data/themealdb/preview.json" },
    from: { type: "string" },
    "delay-ms": { type: "string", default: "250" },
  },
})

function fail(message) {
  console.error(`\n${message}\n`)
  process.exit(1)
}

if (args["dry-run"] === args.write) {
  fail("Pick one: --dry-run (writes a JSON preview) or --write (upserts into Supabase).")
}

for (const file of [".env.local", ".env"]) {
  const full = path.join(ROOT, file)
  if (existsSync(full)) process.loadEnvFile(full)
}

// ── Fetch ───────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * GET one TheMealDB endpoint ("search.php?f=a"). The key is part of the URL, so messages
 * only ever name the endpoint, never the URL.
 */
async function fetchJson(base, endpoint, attempt = 1) {
  let status = null
  try {
    const response = await fetch(`${base}/${endpoint}`, { headers: { accept: "application/json" } })
    status = response.status
    if (response.ok) return await response.json()
  } catch {
    // Network error: retried below.
  }
  if (status !== null && status !== 429 && status < 500) fail(`TheMealDB said ${status} for ${endpoint}.`)
  if (attempt >= 4) fail(`Couldn't reach TheMealDB for ${endpoint}${status ? ` (HTTP ${status})` : ""}. Try again later.`)
  await sleep(1000 * 2 ** attempt)
  return fetchJson(base, endpoint, attempt + 1)
}

/** Every meal: search.php?f=<letter> for a to z (the documented way to list them all). */
async function fetchAllMeals() {
  const key = process.env.THEMEALDB_API_KEY?.trim()
  if (!key) fail("Set THEMEALDB_API_KEY (TheMealDB's test key is 1, for development only).")
  if (!/^[A-Za-z0-9]{1,64}$/.test(key)) fail("THEMEALDB_API_KEY doesn't look like a TheMealDB key.")
  const base = `https://www.themealdb.com/api/json/v1/${key}`
  const delay = Math.max(0, Number(args["delay-ms"]) || 0)
  const meals = []
  for (const letter of "abcdefghijklmnopqrstuvwxyz") {
    const found = mealsFromResponse(await fetchJson(base, `search.php?f=${letter}`))
    meals.push(...found)
    process.stdout.write(`${letter}:${found.length} `)
    await sleep(delay)
  }
  process.stdout.write("\n")
  return meals
}

const meals = args.from ? mealsFromResponse(JSON.parse(readFileSync(path.resolve(args.from), "utf8"))) : await fetchAllMeals()
const { recipes, skipped, unmatched } = convertMeals(meals)

// ── Summary ─────────────────────────────────────────────────────────────────

function summary(verb) {
  const lines = recipes.reduce((n, r) => n + r.ingredients.length, 0)
  const matched = recipes.reduce((n, r) => n + r.ingredients.filter((i) => i.ingredient_id !== null).length, 0)
  console.log(`\n${verb} ${recipes.length} recipes (${lines} ingredient lines, ${matched} matched to the library).`)
  if (skipped.length > 0) console.log(`Skipped ${skipped.length} with no id, title or ingredients: ${skipped.join(", ")}`)
  const top = [...unmatched.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  console.log(`\n${top.length} ingredient names didn't match the library (recipes using each):`)
  for (const [name, count] of top) console.log(`  ${String(count).padStart(3)}  ${name}`)
}

// ── Dry run ─────────────────────────────────────────────────────────────────

if (args["dry-run"]) {
  const out = path.resolve(ROOT, args.out)
  mkdirSync(path.dirname(out), { recursive: true })
  writeFileSync(
    out,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        recipes,
        skipped,
        unmatched: Object.fromEntries([...unmatched.entries()].sort((a, b) => b[1] - a[1])),
      },
      null,
      1,
    ),
  )
  summary("Would import")
  console.log(`\nPreview written to ${path.relative(ROOT, out)}. Nothing was written to the database.`)
  process.exit(0)
}

// ── Write ───────────────────────────────────────────────────────────────────

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY
if (!url || !secret) fail("--write needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.")

const { createClient } = await import("@supabase/supabase-js")
const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })
console.log(`Writing to ${new URL(url).host} …`)

const BATCH = 50
let written = 0
for (let i = 0; i < recipes.length; i += BATCH) {
  const batch = recipes.slice(i, i + BATCH)
  // Upsert on (source, source_id): re-running updates the same rows.
  const { data, error } = await db
    .from("recipes")
    .upsert(
      batch.map((recipe) => {
        const row = { ...recipe, household_id: null }
        delete row.ingredients
        return row
      }),
      { onConflict: "source,source_id" },
    )
    .select("id, source_id")
  if (error) fail(`Saving recipes failed: ${error.message}`)

  const ids = new Map(data.map((row) => [row.source_id, row.id]))
  const recipeIds = [...ids.values()]
  const { error: deleteError } = await db.from("recipe_ingredients").delete().in("recipe_id", recipeIds)
  if (deleteError) fail(`Replacing ingredients failed: ${deleteError.message}`)
  const rows = batch.flatMap((recipe) =>
    recipe.ingredients.map((line) => ({ ...line, recipe_id: ids.get(recipe.source_id) })),
  )
  const { error: insertError } = await db.from("recipe_ingredients").insert(rows)
  if (insertError) fail(`Saving ingredients failed: ${insertError.message}`)

  written += batch.length
  process.stdout.write(`\r${written}/${recipes.length}`)
}

summary("Imported")
