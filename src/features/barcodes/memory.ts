// Pure: what to remember for each scanned item once it's added.
import type { BarcodeMemory } from "./types"

/** One package, as the scan found it. */
export type ScanPackage = { quantity: number | null; unit: string }

/**
 * The household's name for each code is whatever the item was added as. The amount
 * remembered is one package (so buying two cartons once doesn't make every scan 48 eggs),
 * unless the unit was changed in review, or the scan had no size, then it's what was added.
 */
export function barcodeMemories(
  added: readonly { code: string; name: string; quantity: number | null; unit: string }[],
  packages: ReadonlyMap<string, ScanPackage>,
): BarcodeMemory[] {
  const byCode = new Map<string, BarcodeMemory>()
  for (const item of added) {
    const scanned = packages.get(item.code)
    const keepPackage = scanned && scanned.quantity !== null && scanned.unit === item.unit
    byCode.set(item.code, {
      code: item.code,
      name: item.name.trim().toLowerCase().slice(0, 80),
      quantity: keepPackage ? scanned.quantity : item.quantity,
      unit: item.unit,
    })
  }
  return [...byCode.values()]
}
