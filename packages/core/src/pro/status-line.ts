import type { ProStatus } from "./status"

function day(iso: string, timeZone: string | undefined) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone })
}

/** One line under "LazyChef Pro" on the Household page. */
export function proStatusLine(status: ProStatus, timeZone?: string): string {
  if (status.mePro && status.meSource === "comp") return "Pro is on the house. Enjoy!"
  if (status.mePro) {
    if (status.billingIssueAt) return "There's a problem with your payment. Update it in your store account to keep Pro."
    if (!status.expiresAt) return "You have Pro for life."
    const end = day(status.expiresAt, timeZone)
    if (status.periodType === "trial") {
      return status.willRenew ? `Free trial until ${end}, then your plan starts.` : `Free trial until ${end}. It won't renew.`
    }
    return status.willRenew ? `Renews ${end}.` : `Pro until ${end}. It won't renew.`
  }
  if (status.householdPro) {
    return status.sponsorName
      ? `${status.sponsorName}'s Pro covers everyone in this household.`
      : "Someone in this household has Pro, so it covers you too."
  }
  return "You're on the free plan."
}
