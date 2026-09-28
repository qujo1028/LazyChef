// OWNER: parser agent. Contract stub — keep these exports and signatures.
// Pure module (no Node/Next APIs); used on both server and client.

export type Dimension = "mass" | "volume" | "count" | "package"

/** Choices for unit pickers, canonical keys with display labels. */
export const UNIT_OPTIONS: { value: string; label: string }[] = [{ value: "count", label: "count" }]

/** "lbs" → "lb", "Tablespoons" → "tbsp", "dozen" → null (dozen is handled by the parser as ×12). Unknown → null. */
export function normalizeUnit(input: string): string | null {
  void input
  return null
}

export function unitDimension(unit: string): Dimension {
  void unit
  return "count"
}

/** Converts within a dimension (mass↔mass, volume↔volume, same package unit). null if impossible. */
export function convertQuantity(quantity: number, from: string, to: string): number | null {
  return from === to ? quantity : null
}

/** "2 lb", "12", "1½ cups", "some" (null quantity). */
export function formatQuantity(quantity: number | null, unit: string): string {
  return quantity === null ? "some" : `${quantity} ${unit === "count" ? "" : unit}`.trim()
}
