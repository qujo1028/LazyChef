#!/usr/bin/env node
// Lists every library recipe in scope for the photo refresh and measures its current photo:
// visible (hidden = false) TheMealDB recipes, and visible LazyChef recipes (with or without a photo).
// Writes data/library-photos/audit.json and keeps an 800 px copy of each current photo in
// data/library-photos/cache/current/<id>.jpg (gitignored) for reviewers to look at. Read-only:
// it never writes to the database or the bucket.
//
//   node scripts/library-photo-audit.mjs [--only id,id]
//
// Env (from the shell or .env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY.
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const OUT_DIR = path.join(ROOT, "data/library-photos")
const CACHE = path.join(OUT_DIR, "cache/current")
const USER_AGENT = "LazyChefLibraryImport/1.0 (https://github.com/qujo1028/LazyChef)"
const COMMONS_API = "https://commons.wikimedia.org/w/api.php"
const CONCURRENCY = 8

const { values: args } = parseArgs({ options: { only: { type: "string" } } })

function fail(message) {
  console.error(`\n${message}\n`)
  process.exit(1)
}

for (const file of [".env.local", ".env"]) {
  const full = path.join(ROOT, file)
  if (existsSync(full)) process.loadEnvFile(full)
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY
if (!url || !secret) fail("Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.")

const { createClient } = await import("@supabase/supabase-js")
const sharp = (await import("sharp")).default
const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function readRows() {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("recipes")
      .select(
        "id, source, source_id, title, cuisine, extended, image_url, image_author, image_license, image_license_url, image_source_url, image_ai_generated",
      )
      .is("household_id", null)
      .eq("hidden", false)
      .in("source", ["themealdb", "lazychef"])
      .order("id")
      .range(from, from + 999)
    if (error) fail(`Reading recipes failed: ${error.message}`)
    rows.push(...data)
    if (data.length < 1000) return rows
  }
}

async function fetchBuffer(target, attempt = 1) {
  const response = await fetch(target, { headers: { "user-agent": USER_AGENT } }).catch(() => null)
  if (response?.ok) return Buffer.from(await response.arrayBuffer())
  if (response && response.status < 500 && response.status !== 429) return null
  if (attempt >= 4) return null
  await sleep(1000 * 2 ** attempt)
  return fetchBuffer(target, attempt + 1)
}

/** Original size of a Commons file, from its File: page URL. */
async function commonsSize(pageUrl) {
  const match = /\/wiki\/(File:[^?#]+)/.exec(pageUrl ?? "")
  if (!match) return null
  const params = new URLSearchParams({
    action: "query", format: "json", prop: "imageinfo", iiprop: "size", titles: decodeURIComponent(match[1]),
  })
  const body = await fetchBuffer(`${COMMONS_API}?${params}`)
  if (!body) return null
  const page = Object.values(JSON.parse(body.toString()).query?.pages ?? {})[0]
  const info = page?.imageinfo?.[0]
  return info ? { width: info.width, height: info.height } : null
}

async function audit(row) {
  const entry = {
    id: row.id,
    title: row.title,
    source: row.source,
    source_id: row.source_id,
    cuisine: row.cuisine,
    extended: row.extended,
    image_url: row.image_url,
    image_author: row.image_author,
    image_license: row.image_license,
    image_license_url: row.image_license_url,
    image_source_url: row.image_source_url,
    image_ai_generated: row.image_ai_generated === true,
    width: null,
    height: null,
    short_side: null,
    original: null,
    problem: null,
  }
  if (row.source === "lazychef" && row.image_source_url) entry.original = await commonsSize(row.image_source_url)
  if (!row.image_url) {
    entry.problem = "no photo"
    return entry
  }
  const body = await fetchBuffer(row.image_url)
  if (!body) {
    entry.problem = "couldn't download"
    return entry
  }
  try {
    const image = sharp(body, { failOn: "none" }).rotate()
    const meta = await image.metadata()
    const swap = (meta.orientation ?? 1) >= 5
    entry.width = swap ? meta.height : meta.width
    entry.height = swap ? meta.width : meta.height
    entry.short_side = Math.min(entry.width, entry.height)
    await image.resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toFile(path.join(CACHE, `${row.id}.jpg`))
  } catch (error) {
    entry.problem = `couldn't read (${error.message})`
  }
  return entry
}

mkdirSync(CACHE, { recursive: true })
let rows = await readRows()
if (args.only) {
  const only = new Set(args.only.split(","))
  rows = rows.filter((row) => only.has(row.id))
}

const results = new Array(rows.length)
let next = 0
let done = 0
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < rows.length) {
      const i = next++
      results[i] = await audit(rows[i])
      done += 1
      process.stdout.write(`\r${done}/${rows.length}`)
    }
  }),
)
process.stdout.write("\n")

const count = (filter) => results.filter(filter).length
const summary = {
  themealdb: count((r) => r.source === "themealdb"),
  lazychef_with_photo: count((r) => r.source === "lazychef" && r.image_url),
  lazychef_without_photo: count((r) => r.source === "lazychef" && !r.image_url),
  short_side_under_1000: count((r) => r.short_side !== null && r.short_side < 1000),
  problems: count((r) => r.problem && r.problem !== "no photo"),
}
writeFileSync(path.join(OUT_DIR, "audit.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), summary, recipes: results }, null, 1)}\n`)
console.log(summary)
console.log(`Wrote ${path.relative(ROOT, path.join(OUT_DIR, "audit.json"))}.`)
