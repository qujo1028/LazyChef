/** First value of a search param (Next passes string | string[] | undefined). */
export function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}
