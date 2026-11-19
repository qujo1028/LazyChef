#!/usr/bin/env node
// Finds freely licensed photo candidates on Wikimedia Commons for the library dishes
// (data/lazychef/dishes.json) and writes data/lazychef/photo-candidates.json. Each candidate has
// the license, author and links the apps must show. Only CC0, public domain, CC BY and CC BY-SA
// files at least 1200 px wide are kept. A person (or an agent looking at the thumbnails) picks one
// per dish afterwards; this script never decides.
//
//   node scripts/find-library-photos.mjs [--only slug,slug]
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const OUT = path.join(ROOT, "data/lazychef/photo-candidates.json")
const USER_AGENT = "LazyChefLibraryImport/1.0 (https://github.com/qujo1028/LazyChef)"
const API = "https://commons.wikimedia.org/w/api.php"
const MIN_WIDTH = 1200
const PER_DISH = 6

const onlyArg = process.argv.indexOf("--only")
const only = onlyArg > 0 ? new Set(process.argv[onlyArg + 1].split(",")) : null
const dishes = JSON.parse(readFileSync(path.join(ROOT, "data/lazychef/dishes.json"), "utf8")).filter((d) => !only || only.has(d.slug))
/** Earlier results, so --only runs add to them. Read in one step (no exists check first). */
function readResults() {
  try {
    return JSON.parse(readFileSync(OUT, "utf8"))
  } catch (error) {
    if (error.code === "ENOENT") return {}
    throw error
  }
}
const results = readResults()

// &amp; is decoded last, so "&amp;quot;" stays the text "&quot;" instead of being decoded twice.
const strip = (html) =>
  String(html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** "CC BY-SA 4.0" → kept; anything else (GFDL only, fair use, NC, ND) → null. */
export function allowedLicense(short) {
  const s = String(short ?? "").trim()
  if (/^(cc0|cc-zero)/i.test(s)) return "CC0"
  if (/^public domain/i.test(s) || /^pd/i.test(s)) return "Public domain"
  const m = s.match(/^cc[- ]by(-sa)?[- ]?(\d(?:\.\d)?)?/i)
  if (!m || /nc|nd/i.test(s)) return null
  return `CC BY${m[1] ? "-SA" : ""}${m[2] ? ` ${m[2]}` : ""}`
}

async function search(query) {
  const params = new URLSearchParams({
    action: "query", format: "json", generator: "search", gsrnamespace: "6", gsrlimit: "20",
    gsrsearch: `${query} filetype:bitmap`, prop: "imageinfo", iiprop: "url|size|extmetadata|mime", iiurlwidth: "400",
  })
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`${API}?${params}`, { headers: { "user-agent": USER_AGENT } }).catch(() => null)
    if (res?.ok) return Object.values((await res.json()).query?.pages ?? {}).sort((a, b) => a.index - b.index)
    await sleep(1000 * 2 ** attempt)
  }
  return []
}

for (const [i, dish] of dishes.entries()) {
  const pages = await search(dish.title)
  const candidates = []
  for (const page of pages) {
    const info = page.imageinfo?.[0]
    if (!info || !/^image\/(jpeg|png|webp)$/.test(info.mime) || info.width < MIN_WIDTH) continue
    const meta = info.extmetadata ?? {}
    const license = allowedLicense(meta.LicenseShortName?.value)
    if (!license) continue
    const author = strip(meta.Artist?.value).slice(0, 200)
    const needsCredit = !/^(CC0|Public domain)/.test(license)
    if (needsCredit && !author) continue
    candidates.push({
      file: page.title,
      from: info.url,
      thumb: info.thumburl,
      width: info.width,
      height: info.height,
      license,
      license_url: meta.LicenseUrl?.value?.startsWith("https://") ? meta.LicenseUrl.value : null,
      author: author || null,
      source_url: info.descriptionurl,
      description: strip(meta.ImageDescription?.value).slice(0, 300),
    })
    if (candidates.length >= PER_DISH) break
  }
  results[dish.slug] = { title: dish.title, candidates }
  process.stdout.write(`\r${i + 1}/${dishes.length}`)
  writeFileSync(OUT, JSON.stringify(results, null, 1))
  await sleep(250)
}
const none = Object.entries(results).filter(([, r]) => r.candidates.length === 0).map(([s]) => s)
console.log(`\n${Object.keys(results).length} dishes searched, ${none.length} with no usable photo.`)
