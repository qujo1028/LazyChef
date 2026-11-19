// Upserts shared library recipes on (source, source_id) without undoing later photo work: a row
// that already has a photo keeps image_url and its credit columns (see keep-photos.ts). Pass
// replacePhotos to overwrite them on purpose.
import path from "node:path"
import { fileURLToPath } from "node:url"

import "./ts-paths.mjs"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const { splitPhotoRows } = await import(path.join(ROOT, "packages/core/src/recipes/import/keep-photos.ts"))

const CHUNK = 200

/** Source ids of library rows from `source` that already have a photo. */
export async function sourceIdsWithPhoto(db, source, sourceIds) {
  const found = new Set()
  for (let i = 0; i < sourceIds.length; i += CHUNK) {
    const { data, error } = await db
      .from("recipes")
      .select("source_id")
      .eq("source", source)
      .is("household_id", null)
      .not("image_url", "is", null)
      .in("source_id", sourceIds.slice(i, i + CHUNK))
    if (error) throw new Error(`Reading existing photos failed: ${error.message}`)
    for (const row of data) found.add(row.source_id)
  }
  return found
}

/** Upserts rows (no `ingredients` key) and returns [{ id, source_id }]. */
export async function upsertLibraryRows(db, rows, { withPhoto, replacePhotos = false }) {
  const { full, keepPhoto } = replacePhotos ? { full: rows, keepPhoto: [] } : splitPhotoRows(rows, withPhoto)
  const saved = []
  for (const group of [full, keepPhoto]) {
    if (group.length === 0) continue
    const { data, error } = await db.from("recipes").upsert(group, { onConflict: "source,source_id" }).select("id, source_id")
    if (error) throw new Error(`Saving recipes failed: ${error.message}`)
    saved.push(...data)
  }
  return saved
}
