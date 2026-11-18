// Pure and small (safe for the browser): validates scanned or typed barcodes and puts
// them in one canonical form.

/** GS1 check digit: the last digit makes the weighted sum a multiple of 10. */
function hasValidCheckDigit(digits: string): boolean {
  let sum = 0
  for (let i = 0; i < digits.length - 1; i++) {
    // Weights 3,1,3,1… counting from the digit next to the check digit.
    const fromRight = digits.length - 1 - i
    sum += Number(digits[i]) * (fromRight % 2 === 1 ? 3 : 1)
  }
  return (10 - (sum % 10)) % 10 === Number(digits.at(-1))
}

/** UPC-E (8 digits, zeros squeezed out) back to its 12-digit UPC-A. */
export function expandUpcE(code: string): string | null {
  if (!/^[01]\d{7}$/.test(code)) return null
  const [system, d1, d2, d3, d4, d5, d6, check] = code
  let body: string
  if (d6 === "0" || d6 === "1" || d6 === "2") body = `${d1}${d2}${d6}0000${d3}${d4}${d5}`
  else if (d6 === "3") body = `${d1}${d2}${d3}00000${d4}${d5}`
  else if (d6 === "4") body = `${d1}${d2}${d3}${d4}00000${d5}`
  else body = `${d1}${d2}${d3}${d4}${d5}0000${d6}`
  return `${system}${body}${check}`
}

/**
 * A scanned or typed code in one canonical form, or null if it isn't a valid product
 * barcode. UPC-A, UPC-E and a GTIN-14 with a leading 0 all become the 13-digit EAN,
 * so the same carton is the same code however it was read. EAN-8 stays 8 digits.
 */
export function normalizeBarcode(input: string): string | null {
  const digits = input.replace(/[\s-]/g, "")
  if (!/^\d+$/.test(digits)) return null
  if (digits.length === 8) {
    if (hasValidCheckDigit(digits)) return digits // EAN-8
    const upcA = expandUpcE(digits)
    return upcA && hasValidCheckDigit(upcA) ? `0${upcA}` : null
  }
  if (digits.length === 12) return hasValidCheckDigit(digits) ? `0${digits}` : null
  if (digits.length === 13) return hasValidCheckDigit(digits) ? digits : null
  if (digits.length === 14) return hasValidCheckDigit(digits) && digits.startsWith("0") ? digits.slice(1) : null
  return null
}

