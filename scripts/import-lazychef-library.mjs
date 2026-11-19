#!/usr/bin/env node
// Imports LazyChef's own recipes (data/lazychef/recipes.json: everyday American and Chinese home
// cooking) into the shared recipe library (recipes + recipe_ingredients, household_id null), with
// their photos copied into the public library-photos bucket. Not part of the app: run it by hand
// after reviewing a dry run.
//
//   npm run recipes:lazychef -- --dry-run     check every recipe, write data/lazychef/preview.json, touch nothing
//   npm run recipes:lazychef -- --write       resize and upload photos, upsert recipes (safe to re-run)
//   npm run recipes:lazychef -- --write --only us-baked-mac-and-cheese,cn-sesame-chicken
//
// Each recipe's `photo.from` is where the photo comes from: an https URL (a Wikimedia Commons file)
// or a local file (an AI-generated image). The photo is resized to 1200 px wide JPEG and uploaded to
// library-photos/<slug>.jpg; the recipe stores that public URL plus the credit (author, license,
// links) the apps show under it.
//
// Env (from the shell or .env.local), only for --write:
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY   the secret key bypasses RLS and storage policies,
//                          which is the only way to write the shared library and the bucket.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

import "./lib/ts-paths.mjs"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const { checkLibraryRecipe } = await import(path.join(ROOT, "packages/core/src/recipes/import/lazychef.ts"))

const BUCKET = "library-photos"
const PHOTO_WIDTH = 1200
// Wikimedia asks automated clients to name themselves.
const USER_AGENT = "LazyChefLibraryImport/1.0 (https://github.com/qujo1028/LazyChef)"

const { values: args } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    write: { type: "boolean", default: false },
    from: { type: "string", default: "data/lazychef/recipes.json" },
    out: { type: "string", default: "data/lazychef/preview.json" },
    only: { type: "string" },
  },
})

function fail(message) {
  console.error(`\n${message}\n`)
  process.exit(1)
}

if (args["dry-run"] === args.write) {
  fail("Pick one: --dry-run (writes a JSON preview) or --write (uploads photos and upserts into Supabase).")
}

for (const file of [".env.local", ".env"]) {
  const full = path.join(ROOT, file)
  if (existsSync(full)) process.loadEnvFile(full)
}

// ── Read and check ──────────────────────────────────────────────────────────

const source = path.resolve(ROOT, args.from)
if (!existsSync(source)) fail(`No recipes at ${path.relative(ROOT, source)}.`)
let drafts = JSON.parse(readFileSync(source, "utf8"))
if (!Array.isArray(drafts)) fail(`${path.relative(ROOT, source)} should hold an array of recipes.`)
if (args.only) {
  const only = new Set(args.only.split(",").map((slug) => slug.trim()))
  drafts = drafts.filter((draft) => only.has(draft.slug))
}

const slugs = new Set()
for (const draft of drafts) {
  if (slugs.has(draft.slug)) fail(`Slug ${draft.slug} is listed twice.`)
  slugs.add(draft.slug)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const publicBase = url ? `${new URL(url).origin}/storage/v1/object/public/${BUCKET}` : "https://example.supabase.co/storage/v1/object/public/library-photos"

/** The photo as the database will store it: our bucket's URL, plus the credit. */
function storedPhoto(draft) {
  if (!draft.photo?.from) return null
  return { ...draft.photo, url: `${publicBase}/${draft.slug}.jpg` }
}

const checked = drafts.map((draft) => ({ draft, ...checkLibraryRecipe({ ...draft, photo: storedPhoto(draft) }) }))
const broken = checked.filter((item) => item.recipe === null)
const recipes = checked.filter((item) => item.recipe !== null)

function summary(verb) {
  const lines = recipes.reduce((n, item) => n + item.recipe.ingredients.length, 0)
  const matched = recipes.reduce((n, item) => n + item.recipe.ingredients.filter((i) => i.ingredient_id !== null).length, 0)
  const byCuisine = new Map()
  for (const { recipe } of recipes) byCuisine.set(recipe.cuisine, (byCuisine.get(recipe.cuisine) ?? 0) + 1)
  const photos = recipes.filter((item) => item.recipe.image_url)
  const ai = photos.filter((item) => item.recipe.image_ai_generated).length
  console.log(`\n${verb} ${recipes.length} recipes (${[...byCuisine].map(([c, n]) => `${n} ${c}`).join(", ")}).`)
  console.log(`${lines} ingredient lines, ${matched} matched to the library.`)
  console.log(`${photos.length} photos (${photos.length - ai} licensed, ${ai} AI-generated), ${recipes.length - photos.length} without.`)
  const flagged = recipes.filter((item) => item.issues.length > 0)
  if (flagged.length > 0) {
    console.log(`\n${flagged.length} recipes with notes:`)
    for (const item of flagged) console.log(`  ${item.recipe.source_id}: ${item.issues.join("; ")}`)
  }
}

if (broken.length > 0) {
  for (const item of broken) console.error(`  ${item.draft.slug ?? "(no slug)"}: ${item.issues.join("; ")}`)
  fail(`${broken.length} recipes can't be stored as they are. Fix them in ${path.relative(ROOT, source)} first.`)
}

// ── Dry run ─────────────────────────────────────────────────────────────────

if (args["dry-run"]) {
  const out = path.resolve(ROOT, args.out)
  mkdirSync(path.dirname(out), { recursive: true })
  writeFileSync(
    out,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), recipes: recipes.map((item) => ({ ...item.recipe, notes: item.issues })) },
      null,
      1,
    ),
  )
  summary("Would import")
  console.log(`\nPreview written to ${path.relative(ROOT, out)}. Nothing was uploaded or written to the database.`)
  process.exit(0)
}

// ── Write ───────────────────────────────────────────────────────────────────

const secret = process.env.SUPABASE_SECRET_KEY
if (!url || !secret) fail("--write needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.")

const { createClient } = await import("@supabase/supabase-js")
const sharp = (await import("sharp")).default
const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })
console.log(`Writing to ${new URL(url).host} …`)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function download(from, attempt = 1) {
  if (!/^https:\/\//i.test(from)) return readFileSync(path.resolve(ROOT, from))
  const response = await fetch(from, { headers: { "user-agent": USER_AGENT } }).catch(() => null)
  if (response?.ok) return Buffer.from(await response.arrayBuffer())
  if (attempt >= 4) fail(`Couldn't download ${from}${response ? ` (HTTP ${response.status})` : ""}.`)
  await sleep(1500 * 2 ** attempt)
  return download(from, attempt + 1)
}

/** Resize to 1200 px wide (never upscaled), strip metadata, JPEG. */
async function uploadPhoto(draft) {
  const original = await download(draft.photo.from)
  let jpeg
  try {
    // failOn "none": tolerate the small encoding faults some camera JPEGs carry.
    jpeg = await sharp(original, { failOn: "none" })
      .rotate()
      .resize({ width: PHOTO_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer()
  } catch (error) {
    return `couldn't read the image (${error.message})`
  }
  // Retries: a long run of uploads can hit a dropped connection ("fetch failed").
  for (let attempt = 1; ; attempt++) {
    const { error } = await db.storage
      .from(BUCKET)
      .upload(`${draft.slug}.jpg`, jpeg, { contentType: "image/jpeg", upsert: true, cacheControl: "604800" })
      .catch((thrown) => ({ error: thrown }))
    if (!error) return null
    if (attempt >= 4) fail(`Uploading the photo for ${draft.slug} failed: ${error.message}`)
    await sleep(1500 * 2 ** attempt)
  }
}

const NO_PHOTO = {
  image_url: null,
  image_author: null,
  image_license: null,
  image_license_url: null,
  image_source_url: null,
  image_ai_generated: false,
}
const skippedPhotos = []
let uploaded = 0
for (const item of recipes) {
  if (!item.draft.photo?.from) continue
  const problem = await uploadPhoto(item.draft)
  if (problem) {
    // The recipe still goes in, without a photo, rather than stopping the whole import.
    skippedPhotos.push(`${item.draft.slug}: ${problem}`)
    Object.assign(item.recipe, NO_PHOTO)
    continue
  }
  uploaded += 1
  process.stdout.write(`\rPhotos ${uploaded}`)
  if (/^https:/i.test(item.draft.photo.from)) await sleep(300)
}
if (uploaded > 0) process.stdout.write("\n")

const BATCH = 50
let written = 0
for (let i = 0; i < recipes.length; i += BATCH) {
  const batch = recipes.slice(i, i + BATCH).map((item) => item.recipe)
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
  const { error: deleteError } = await db.from("recipe_ingredients").delete().in("recipe_id", [...ids.values()])
  if (deleteError) fail(`Replacing ingredients failed: ${deleteError.message}`)
  const rows = batch.flatMap((recipe) => recipe.ingredients.map((line) => ({ ...line, recipe_id: ids.get(recipe.source_id) })))
  const { error: insertError } = await db.from("recipe_ingredients").insert(rows)
  if (insertError) fail(`Saving ingredients failed: ${insertError.message}`)

  written += batch.length
  process.stdout.write(`\rRecipes ${written}/${recipes.length}`)
}

summary("\nImported")
if (skippedPhotos.length > 0) {
  console.log(`\n${skippedPhotos.length} photos skipped (those recipes went in without one):`)
  for (const line of skippedPhotos) console.log(`  ${line}`)
}
