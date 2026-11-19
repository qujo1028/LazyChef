#!/usr/bin/env node
// Applies (or reverts) the library photo refresh in data/library-photos/replacements.json: each new
// photo is downloaded, resized to 1600 px on the long side (JPEG, under about 300 KB), uploaded to
// the public library-photos bucket at v2/<recipe id>-<hash>.jpg, and the recipe's image_url and
// credit columns are updated. The old values stay in replacements.json, and the old bucket files
// are never deleted, so any row can be put back.
//
//   node scripts/library-photos.mjs --dry-run              check every entry, touch nothing
//   node scripts/library-photos.mjs --write                upload and update (safe to re-run)
//   node scripts/library-photos.mjs --write --only id,id
//   node scripts/library-photos.mjs --revert <id>[,<id>]   put the old photo and credit back
//   node scripts/library-photos.mjs --revert all
//
// A row is only changed when it still holds the photo this script expects (the old one for
// --write, the new one for --revert), so a photo changed some other way is never overwritten.
//
// Env (from the shell or .env.local), not for --dry-run: NEXT_PUBLIC_SUPABASE_URL,
// SUPABASE_SECRET_KEY (the secret key is the only way to write the shared library and the bucket).
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const FILE = path.join(ROOT, "data/library-photos/replacements.json")
const BUCKET = "library-photos"
const LONG_SIDE = 1600
const MIN_SHORT_SIDE = 1000
const MAX_BYTES = 300 * 1024
const ALLOWED_HOSTS = new Set(["images.pexels.com", "upload.wikimedia.org"])
const USER_AGENT = "LazyChefLibraryImport/1.0 (https://github.com/qujo1028/LazyChef)"
const CREDIT = ["image_url", "image_author", "image_license", "image_license_url", "image_source_url", "image_ai_generated"]

const { values: args } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    write: { type: "boolean", default: false },
    revert: { type: "string" },
    only: { type: "string" },
  },
})

function fail(message) {
  console.error(`\n${message}\n`)
  process.exit(1)
}

const modes = [args["dry-run"], args.write, args.revert !== undefined].filter(Boolean).length
if (modes !== 1) fail("Pick one: --dry-run, --write or --revert <id|all>.")

for (const file of [".env.local", ".env"]) {
  const full = path.join(ROOT, file)
  if (existsSync(full)) process.loadEnvFile(full)
}

if (!existsSync(FILE)) fail(`No ${path.relative(ROOT, FILE)} yet.`)
const { replacements } = JSON.parse(readFileSync(FILE, "utf8"))
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const publicBase = `${url ? new URL(url).origin : "https://example.supabase.co"}/storage/v1/object/public/${BUCKET}`

/** Where the new photo lives in the bucket: stable for the same recipe and source file. */
function objectPath(entry) {
  const hash = createHash("sha256").update(entry.new.from).digest("hex").slice(0, 10)
  return `v2/${entry.recipe_id}-${hash}.jpg`
}

/** The credit columns as stored after the change. */
function newColumns(entry) {
  return {
    image_url: `${publicBase}/${objectPath(entry)}`,
    image_author: entry.new.author ?? null,
    image_license: entry.new.license ?? null,
    image_license_url: entry.new.license_url ?? null,
    image_source_url: entry.new.source_url ?? null,
    image_ai_generated: false,
  }
}

function check(entry) {
  const problems = []
  if (!entry.recipe_id) problems.push("no recipe_id")
  let host = null
  try {
    host = new URL(entry.new?.from).hostname
  } catch {
    // reported below
  }
  if (!ALLOWED_HOSTS.has(host)) problems.push(`photo must come from ${[...ALLOWED_HOSTS].join(" or ")}`)
  if (!entry.new?.license) problems.push("no license")
  const needsAuthor = !/^(CC0|Public domain)$/.test(entry.new?.license ?? "")
  if (needsAuthor && !entry.new?.author) problems.push("no author")
  if (!/^https:\/\//.test(entry.new?.source_url ?? "")) problems.push("no https source page")
  if (!entry.old || !("image_url" in entry.old)) problems.push("old values missing (needed to revert)")
  return problems
}

const only = args.only ? new Set(args.only.split(",")) : null
const selected = replacements.filter((entry) => !only || only.has(entry.recipe_id))
const broken = selected.map((entry) => [entry, check(entry)]).filter(([, problems]) => problems.length > 0)
if (broken.length > 0) {
  for (const [entry, problems] of broken) console.error(`  ${entry.recipe_id} ${entry.title ?? ""}: ${problems.join("; ")}`)
  fail(`${broken.length} entries can't be applied. Fix them in ${path.relative(ROOT, FILE)} first.`)
}
const ids = new Set()
for (const entry of selected) {
  if (ids.has(entry.recipe_id)) fail(`${entry.recipe_id} is listed twice.`)
  ids.add(entry.recipe_id)
}

if (args["dry-run"]) {
  const bySource = {}
  for (const entry of selected) {
    const key = `${entry.source} ${entry.kind} from ${entry.new.provider}`
    bySource[key] = (bySource[key] ?? 0) + 1
  }
  console.log(`${selected.length} replacements look complete:`, bySource)
  process.exit(0)
}

const secret = process.env.SUPABASE_SECRET_KEY
if (!url || !secret) fail("Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.")
const { createClient } = await import("@supabase/supabase-js")
const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function retry(label, run) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run()
    } catch (error) {
      if (attempt >= 4) throw new Error(`${label}: ${error.message}`)
      await sleep(1500 * 2 ** attempt)
    }
  }
}

/** Updates the row only if it still holds `expected` as its image_url. Returns true when it changed. */
async function swap(recipeId, expected, columns) {
  const query = db.from("recipes").update(columns).eq("id", recipeId).is("household_id", null)
  const guarded = expected === null ? query.is("image_url", null) : query.eq("image_url", expected)
  const { data, error } = await guarded.select("id")
  if (error) throw new Error(error.message)
  return data.length === 1
}

async function currentUrl(recipeId) {
  const { data, error } = await db.from("recipes").select("image_url").eq("id", recipeId).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? data.image_url : undefined
}

// ── Revert ──────────────────────────────────────────────────────────────────

if (args.revert !== undefined) {
  const targets = args.revert === "all" ? replacements : replacements.filter((e) => args.revert.split(",").includes(e.recipe_id))
  if (targets.length === 0) fail(`No replacement for ${args.revert}.`)
  const counts = { reverted: 0, already: 0, changed: 0 }
  for (const entry of targets) {
    const target = newColumns(entry).image_url
    const old = Object.fromEntries(CREDIT.map((column) => [column, entry.old[column] ?? (column === "image_ai_generated" ? false : null)]))
    const done = await retry(entry.recipe_id, () => swap(entry.recipe_id, target, old))
    if (done) counts.reverted += 1
    else if ((await currentUrl(entry.recipe_id)) === old.image_url) counts.already += 1
    else {
      counts.changed += 1
      console.log(`  ${entry.recipe_id} ${entry.title}: photo changed since, left alone`)
    }
  }
  console.log(counts)
  process.exit(0)
}

// ── Write ───────────────────────────────────────────────────────────────────

const sharp = (await import("sharp")).default

async function download(from) {
  const response = await fetch(from, { headers: { "user-agent": USER_AGENT } })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

/** 1600 px on the long side (never upscaled), metadata stripped, JPEG under MAX_BYTES if it can be. */
async function prepare(original) {
  const meta = await sharp(original, { failOn: "none" }).rotate().metadata()
  const [w, h] = (meta.orientation ?? 1) >= 5 ? [meta.height, meta.width] : [meta.width, meta.height]
  // Wide photos get a longer long side, so the short side still reaches MIN_SHORT_SIDE.
  const long = Math.max(LONG_SIDE, Math.ceil((MIN_SHORT_SIDE * Math.max(w, h)) / Math.min(w, h)))
  const base = sharp(original, { failOn: "none" })
    .rotate()
    .resize({ width: long, height: long, fit: "inside", withoutEnlargement: true })
  for (const quality of [80, 72, 64, 56]) {
    const { data, info } = await base.clone().jpeg({ quality, mozjpeg: true }).toBuffer({ resolveWithObject: true })
    if (Math.min(info.width, info.height) < MIN_SHORT_SIDE) throw new Error(`only ${info.width}x${info.height}`)
    if (data.length <= MAX_BYTES || quality === 56) return data
  }
}

const counts = { updated: 0, already: 0, changed: 0, failed: 0 }
for (const [i, entry] of selected.entries()) {
  const columns = newColumns(entry)
  try {
    const now = await retry(entry.recipe_id, () => currentUrl(entry.recipe_id))
    if (now === columns.image_url) {
      counts.already += 1
      continue
    }
    if (now !== (entry.old.image_url ?? null)) {
      counts.changed += 1
      console.log(`\n  ${entry.recipe_id} ${entry.title}: photo changed since the audit, left alone`)
      continue
    }
    const jpeg = await prepare(await retry(`download ${entry.recipe_id}`, () => download(entry.new.from)))
    await retry(`upload ${entry.recipe_id}`, async () => {
      const { error } = await db.storage
        .from(BUCKET)
        .upload(objectPath(entry), jpeg, { contentType: "image/jpeg", upsert: true, cacheControl: "604800" })
      if (error) throw new Error(error.message)
    })
    if (await retry(`update ${entry.recipe_id}`, () => swap(entry.recipe_id, entry.old.image_url ?? null, columns))) counts.updated += 1
    else counts.changed += 1
  } catch (error) {
    counts.failed += 1
    console.log(`\n  ${entry.recipe_id} ${entry.title}: ${error.message}`)
  }
  process.stdout.write(`\r${i + 1}/${selected.length}`)
  if (new URL(entry.new.from).hostname === "upload.wikimedia.org") await sleep(300)
}
console.log("\n", counts)
if (counts.failed > 0) process.exitCode = 1
