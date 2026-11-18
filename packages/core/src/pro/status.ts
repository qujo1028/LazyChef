// Pro status as pages and components see it. Plain data, safe on the client.

export type ProStatus = {
  /** Pro features are on for this household (anyone in it has Pro). */
  householdPro: boolean
  /** I have Pro of my own. */
  mePro: boolean
  meSource: "subscription" | "comp" | null
  /** The housemate whose Pro covers the household, when I don't have my own. */
  sponsorName: string | null
  expiresAt: string | null
  willRenew: boolean | null
  periodType: string | null
  store: string | null
  billingIssueAt: string | null
  managementUrl: string | null
  /** When the server read this (ms), so dates render the same on the server and the first client render. */
  checkedAt: number
}

export const FREE_STATUS: ProStatus = {
  householdPro: false,
  mePro: false,
  meSource: null,
  sponsorName: null,
  expiresAt: null,
  willRenew: null,
  periodType: null,
  store: null,
  billingIssueAt: null,
  managementUrl: null,
  checkedAt: 0,
}
