// Re-running a library importer must not undo photo work done later (replaced or rehosted photos
// and their credits). Rows that already exist with a photo keep it; only new rows, or rows still
// without a photo, take the importer's photo. Pure, used by the import scripts.

export const PHOTO_COLUMNS = [
  "image_url",
  "image_author",
  "image_license",
  "image_license_url",
  "image_source_url",
  "image_ai_generated",
] as const

type Row = { source_id: string } & Record<string, unknown>

/**
 * Splits rows into those written with their photo columns and those written without them.
 * `withPhoto` is the set of source ids already stored with a non-null image_url.
 * Kept separate because one bulk upsert sets every column it names on every row (missing ones to null).
 */
export function splitPhotoRows<T extends Row>(
  rows: readonly T[],
  withPhoto: ReadonlySet<string>,
): { full: T[]; keepPhoto: Omit<T, (typeof PHOTO_COLUMNS)[number]>[] } {
  const full: T[] = []
  const keepPhoto: Omit<T, (typeof PHOTO_COLUMNS)[number]>[] = []
  for (const row of rows) {
    if (!withPhoto.has(row.source_id)) {
      full.push(row)
      continue
    }
    const rest: Record<string, unknown> = { ...row }
    for (const column of PHOTO_COLUMNS) delete rest[column]
    keepPhoto.push(rest as Omit<T, (typeof PHOTO_COLUMNS)[number]>)
  }
  return { full, keepPhoto }
}
