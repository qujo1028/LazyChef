#!/usr/bin/env node
// Finds stock photo candidates for the library photo refresh: Pexels first, then Wikimedia Commons
// (CC0, public domain, CC BY, CC BY-SA). Only photos at least 1000 px on the short side are kept.
// Writes one file per recipe to data/library-photos/candidates/<id>.json and a preview of each
// candidate to data/library-photos/cache/candidates/<id>/ (gitignored) for reviewers to look at.
// This script never picks; a reviewer does. Resumable: recipes that already have a candidates
// file are skipped (pass --force to search again). Without a Pexels key it searches Commons only;
// a later run with the key searches Pexels for the recipes searched without it.
//
//   node scripts/find-stock-photos.mjs [--only id,id] [--force]
//
// Targets: every recipe in data/library-photos/audit.json except LazyChef photos a reviewer passed
// (data/library-photos/judge/*.json). Search words come from data/library-photos/queries.json
// ({ id: ["query", ...] }) when present, else the title.
//
// Env (from the shell or .env.local): PEXELS_API_KEY (optional, free). Pexels allows 200 requests an hour by
// default; the script waits for the window to reset when it runs out.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const DIR = path.join(ROOT, "data/library-photos")
const OUT = path.join(DIR, "candidates")
const PREVIEWS = path.join(DIR, "cache/candidates")
const USER_AGENT = "LazyChefLibraryImport/1.0 (https://github.com/qujo1028/LazyChef)"
const COMMONS_API = "https://commons.wikimedia.org/w/api.php"
const MIN_SHORT_SIDE = 1000
const PEXELS_PER_QUERY = 6
const COMMONS_PER_RECIPE = 4

const { values: args } = parseArgs({ options: { only: { type: "string" }, force: { type: "boolean", default: false } } })

function fail(message) {
  console.error(`\n${message}\n`)
  process.exit(1)
}

for (const file of [".env.local", ".env"]) {
  const full = path.join(ROOT, file)
  if (existsSync(full)) process.loadEnvFile(full)
}
const pexelsKey = process.env.PEXELS_API_KEY
if (!pexelsKey) console.log("No PEXELS_API_KEY: searching Wikimedia Commons only.")

const readJson = (file, fallback) => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const audit = readJson(path.join(DIR, "audit.json"), null)
if (!audit) fail("Run node scripts/library-photo-audit.mjs first.")
const passed = new Set()
const judgeDir = path.join(DIR, "judge")
if (existsSync(judgeDir)) {
  for (const file of readdirSync(judgeDir).filter((f) => f.endsWith(".json"))) {
    for (const entry of readJson(path.join(judgeDir, file), [])) if (entry.verdict === "pass") passed.add(entry.id)
  }
}
const queries = readJson(path.join(DIR, "queries.json"), {})
const only = args.only ? new Set(args.only.split(",")) : null
const targets = audit.recipes.filter((r) => !passed.has(r.id) && (!only || only.has(r.id)))

// &amp; is decoded last, so "&amp;quot;" stays the text "&quot;" instead of being decoded twice.
const strip = (html) =>
  String(html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()

/** "CC BY-SA 4.0" is kept; anything else (GFDL only, fair use, NC, ND) is null. */
function allowedLicense(short) {
  const s = String(short ?? "").trim()
  if (/^(cc0|cc-zero)/i.test(s)) return "CC0"
  if (/^public domain/i.test(s) || /^pd/i.test(s)) return "Public domain"
  const m = s.match(/^cc[- ]by(-sa)?[- ]?(\d(?:\.\d)?)?/i)
  if (!m || /nc|nd/i.test(s)) return null
  return `CC BY${m[1] ? "-SA" : ""}${m[2] ? ` ${m[2]}` : ""}`
}

// ── Pexels ──────────────────────────────────────────────────────────────────

let pexelsRemaining = Infinity
let pexelsReset = 0

async function pexelsSearch(query) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    if (pexelsRemaining <= 1 && pexelsReset > Date.now() / 1000) {
      const wait = Math.ceil(pexelsReset - Date.now() / 1000) + 5
      console.log(`\nPexels limit reached; waiting ${Math.ceil(wait / 60)} min for the window to reset.`)
      await sleep(wait * 1000)
    }
    const params = new URLSearchParams({ query, per_page: "15", orientation: "landscape" })
    const response = await fetch(`https://api.pexels.com/v1/search?${params}`, { headers: { Authorization: pexelsKey } }).catch(
      () => null,
    )
    if (response) {
      const remaining = Number(response.headers.get("x-ratelimit-remaining"))
      const reset = Number(response.headers.get("x-ratelimit-reset"))
      if (Number.isFinite(remaining) && response.headers.has("x-ratelimit-remaining")) pexelsRemaining = remaining
      if (Number.isFinite(reset) && reset > 0) pexelsReset = reset
    }
    if (response?.ok) return (await response.json()).photos ?? []
    if (response?.status === 401 || response?.status === 403) fail("Pexels refused the API key.")
    if (response?.status === 429) {
      pexelsRemaining = 0
      if (!(pexelsReset > Date.now() / 1000)) pexelsReset = Date.now() / 1000 + 600
      continue
    }
    await sleep(1000 * 2 ** attempt)
  }
  return []
}

function fromPexels(photo, query) {
  if (Math.min(photo.width, photo.height) < MIN_SHORT_SIDE) return null
  return {
    provider: "pexels",
    key: `pexels-${photo.id}`,
    query,
    from: photo.src.original,
    preview: photo.src.large,
    width: photo.width,
    height: photo.height,
    author: strip(photo.photographer).slice(0, 200) || null,
    license: "Pexels License",
    license_url: "https://www.pexels.com/license/",
    source_url: photo.url,
    description: strip(photo.alt).slice(0, 300),
  }
}

// ── Wikimedia Commons ───────────────────────────────────────────────────────

async function commonsSearch(query) {
  const params = new URLSearchParams({
    action: "query", format: "json", generator: "search", gsrnamespace: "6", gsrlimit: "20",
    gsrsearch: `${query} filetype:bitmap`, prop: "imageinfo", iiprop: "url|size|extmetadata|mime", iiurlwidth: "800",
  })
  for (let attempt = 1; attempt <= 4; attempt++) {
    const response = await fetch(`${COMMONS_API}?${params}`, { headers: { "user-agent": USER_AGENT } }).catch(() => null)
    if (response?.ok) return Object.values((await response.json()).query?.pages ?? {}).sort((a, b) => a.index - b.index)
    await sleep(1000 * 2 ** attempt)
  }
  return []
}

function fromCommons(page, query) {
  const info = page.imageinfo?.[0]
  if (!info || !/^image\/(jpeg|png|webp)$/.test(info.mime) || Math.min(info.width, info.height) < MIN_SHORT_SIDE) return null
  const meta = info.extmetadata ?? {}
  const license = allowedLicense(meta.LicenseShortName?.value)
  if (!license) return null
  const author = strip(meta.Artist?.value).slice(0, 200)
  if (!/^(CC0|Public domain)/.test(license) && !author) return null
  return {
    provider: "wikimedia",
    key: `commons-${page.pageid}`,
    query,
    from: info.url,
    preview: info.thumburl,
    width: info.width,
    height: info.height,
    author: author || null,
    license,
    license_url: meta.LicenseUrl?.value?.startsWith("https://") ? meta.LicenseUrl.value : null,
    source_url: info.descriptionurl,
    description: strip(meta.ImageDescription?.value).slice(0, 300),
  }
}

// ── Run ─────────────────────────────────────────────────────────────────────

async function savePreview(recipeId, candidate) {
  const dir = path.join(PREVIEWS, recipeId)
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${candidate.key}.jpg`)
  if (existsSync(file)) return path.relative(ROOT, file)
  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await fetch(candidate.preview, { headers: { "user-agent": USER_AGENT } }).catch(() => null)
    if (response?.ok) {
      writeFileSync(file, Buffer.from(await response.arrayBuffer()))
      return path.relative(ROOT, file)
    }
    await sleep(1000 * attempt)
  }
  return null
}

mkdirSync(OUT, { recursive: true })
let done = 0
let empty = 0
for (const recipe of targets) {
  const outFile = path.join(OUT, `${recipe.id}.json`)
  done += 1
  const earlier = existsSync(outFile) ? readJson(outFile, null) : null
  if (!args.force && earlier && (earlier.pexels || !pexelsKey)) continue
  const words = (queries[recipe.id]?.length ? queries[recipe.id] : [recipe.title]).slice(0, 2)
  const seen = new Set()
  const candidates = []
  for (const query of pexelsKey ? words : []) {
    for (const photo of await pexelsSearch(query)) {
      const c = fromPexels(photo, query)
      if (c && !seen.has(c.key) && candidates.filter((x) => x.query === query).length < PEXELS_PER_QUERY) {
        seen.add(c.key)
        candidates.push(c)
      }
    }
  }
  let commons = 0
  for (const query of words) {
    for (const page of await commonsSearch(query)) {
      const c = fromCommons(page, query)
      if (c && !seen.has(c.key) && commons < COMMONS_PER_RECIPE) {
        seen.add(c.key)
        candidates.push(c)
        commons += 1
      }
    }
    if (commons >= COMMONS_PER_RECIPE) break
    await sleep(250)
  }
  for (const c of candidates) c.local = await savePreview(recipe.id, c)
  const kept = candidates.filter((c) => c.local)
  if (kept.length === 0) empty += 1
  writeFileSync(outFile, `${JSON.stringify({ id: recipe.id, title: recipe.title, queries: words, pexels: Boolean(pexelsKey), candidates: kept }, null, 1)}\n`)
  process.stdout.write(`\r${done}/${targets.length} (Pexels requests left this hour: ${pexelsRemaining})   `)
}
console.log(`\nSearched ${targets.length} recipes; ${empty} new ones with no usable candidate.`)
