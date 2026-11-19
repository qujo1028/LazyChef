#!/usr/bin/env node
// Builds data/library-photos/replacements.json (what scripts/library-photos.mjs applies) from:
//   audit.json          every in-scope recipe and its current photo and credit (the "old" values)
//   picks/*.json        a reviewer's pick per recipe: [{ id, pick: candidate key | null, reason }]
//   candidates/<id>.json  the candidates the pick refers to
//   judge/*.json        Wikimedia photos that passed: re-hosted from the full-size original
//   dropped.json        optional [{ id, reason }] the lead rejected after spot-checks
// Read-only apart from the output file; it calls the Commons API to find originals.
//
//   node scripts/build-photo-replacements.mjs
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const DIR = path.join(ROOT, "data/library-photos")
const USER_AGENT = "LazyChefLibraryImport/1.0 (https://github.com/qujo1028/LazyChef)"
const COMMONS_API = "https://commons.wikimedia.org/w/api.php"

const readJson = (file, fallback) => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback)
const readAll = (dir) =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).sort().flatMap((f) => readJson(path.join(dir, f), [])) : []
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const audit = new Map(readJson(path.join(DIR, "audit.json"), { recipes: [] }).recipes.map((r) => [r.id, r]))
const dropped = new Map(readJson(path.join(DIR, "dropped.json"), []).map((d) => [d.id, d.reason]))

function old(recipe) {
  return {
    image_url: recipe.image_url,
    image_author: recipe.image_author,
    image_license: recipe.image_license,
    image_license_url: recipe.image_license_url,
    image_source_url: recipe.image_source_url,
    image_ai_generated: false,
  }
}

/** The original upload URL of a Commons file, from its File: page URL. */
async function commonsOriginal(pageUrl) {
  const match = /\/wiki\/(File:[^?#]+)/.exec(pageUrl ?? "")
  if (!match) return null
  const params = new URLSearchParams({ action: "query", format: "json", prop: "imageinfo", iiprop: "url|size", titles: decodeURIComponent(match[1]) })
  for (let attempt = 1; attempt <= 4; attempt++) {
    const response = await fetch(`${COMMONS_API}?${params}`, { headers: { "user-agent": USER_AGENT } }).catch(() => null)
    if (response?.ok) {
      const page = Object.values((await response.json()).query?.pages ?? {})[0]
      const info = page?.imageinfo?.[0]
      return info ? { url: info.url, width: info.width, height: info.height } : null
    }
    await sleep(1000 * 2 ** attempt)
  }
  return null
}

const replacements = []
const report = { stock_pexels: 0, stock_wikimedia: 0, rehost: 0, no_match: [], dropped: [], rehost_failed: [] }
const decided = new Set()

for (const pick of readAll(path.join(DIR, "picks"))) {
  const recipe = audit.get(pick.id)
  if (!recipe || decided.has(pick.id)) continue
  decided.add(pick.id)
  if (dropped.has(pick.id)) {
    report.dropped.push({ id: pick.id, title: recipe.title, reason: dropped.get(pick.id) })
    continue
  }
  if (!pick.pick) {
    report.no_match.push({ id: pick.id, title: recipe.title, source: recipe.source, reason: pick.reason ?? null })
    continue
  }
  const candidate = readJson(path.join(DIR, "candidates", `${pick.id}.json`), { candidates: [] }).candidates.find((c) => c.key === pick.pick)
  if (!candidate) {
    report.no_match.push({ id: pick.id, title: recipe.title, source: recipe.source, reason: `pick ${pick.pick} is not a candidate` })
    continue
  }
  replacements.push({
    recipe_id: recipe.id,
    title: recipe.title,
    source: recipe.source,
    kind: "stock",
    reason: pick.reason ?? null,
    old: old(recipe),
    new: {
      provider: candidate.provider,
      from: candidate.from.replace(/\?utm_.*$/, ""),
      preview: candidate.local,
      width: candidate.width,
      height: candidate.height,
      author: candidate.author,
      license: candidate.license,
      license_url: candidate.license_url,
      source_url: candidate.source_url,
    },
  })
  report[candidate.provider === "pexels" ? "stock_pexels" : "stock_wikimedia"] += 1
}

for (const judged of readAll(path.join(DIR, "judge"))) {
  if (judged.verdict !== "pass" || decided.has(judged.id)) continue
  const recipe = audit.get(judged.id)
  if (!recipe) continue
  decided.add(judged.id)
  if (dropped.has(judged.id)) {
    report.dropped.push({ id: judged.id, title: recipe.title, reason: dropped.get(judged.id) })
    continue
  }
  const original = await commonsOriginal(recipe.image_source_url)
  await sleep(200)
  if (!original || Math.min(original.width, original.height) < 1000) {
    report.rehost_failed.push({ id: recipe.id, title: recipe.title, reason: original ? `original only ${original.width}x${original.height}` : "original not found" })
    continue
  }
  replacements.push({
    recipe_id: recipe.id,
    title: recipe.title,
    source: recipe.source,
    kind: "rehost",
    reason: "photo passed; re-hosted from the full-size original",
    old: old(recipe),
    new: {
      provider: "wikimedia",
      from: original.url,
      preview: `data/library-photos/cache/current/${recipe.id}.jpg`,
      width: original.width,
      height: original.height,
      author: recipe.image_author,
      license: recipe.image_license,
      license_url: recipe.image_license_url,
      source_url: recipe.image_source_url,
    },
  })
  report.rehost += 1
}

const untouched = [...audit.values()].filter((r) => !decided.has(r.id)).map((r) => ({ id: r.id, title: r.title, source: r.source }))
writeFileSync(
  path.join(DIR, "replacements.json"),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), report: { ...report, not_reviewed: untouched }, replacements }, null, 1)}\n`,
)
console.log({
  replacements: replacements.length,
  stock_pexels: report.stock_pexels,
  stock_wikimedia: report.stock_wikimedia,
  rehost: report.rehost,
  no_match: report.no_match.length,
  dropped: report.dropped.length,
  rehost_failed: report.rehost_failed.length,
  not_reviewed: untouched.length,
})
