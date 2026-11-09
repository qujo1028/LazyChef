"use client"

// In-app purchases through RevenueCat, only inside the iOS/Android app. The SDK is loaded on
// demand, so the website never downloads it. RevenueCat knows each person by their Supabase
// user id, which is how the webhook finds them in our database.

import type { PurchasesOffering, PurchasesPackage, PurchasesStoreProduct } from "@revenuecat/purchases-capacitor"

import { getNativePlatform, type NativePlatform } from "@/lib/native/platform"
import { PRO_ENTITLEMENT_ID } from "./entitlement"
import type { PlanId } from "./plans"

export type StorePlan = {
  id: PlanId
  pkg: PurchasesPackage
  /** Local price from the store, e.g. "$24.99" or "24,99 €". */
  price: string
  /** For yearly: the price per month, from the store. */
  perMonth: string | null
  /** Free trial days this person can still get, if any. */
  trialDays: number | null
  /** The raw price, to work out the yearly savings. */
  amount: number
}

export type StorePlans = Partial<Record<PlanId, StorePlan>>

function apiKey(platform: NativePlatform): string | null {
  const key = platform === "ios" ? process.env.NEXT_PUBLIC_REVENUECAT_IOS_KEY : process.env.NEXT_PUBLIC_REVENUECAT_ANDROID_KEY
  return key?.trim() || null
}

async function sdk() {
  return (await import("@revenuecat/purchases-capacitor")).Purchases
}

let setup: Promise<void> | null = null
let currentUser: string | null = null

/** Configures RevenueCat once per app launch, and switches user when someone else signs in. */
export async function setupPurchases(userId: string): Promise<boolean> {
  const platform = getNativePlatform()
  if (!platform) return false
  const key = apiKey(platform)
  if (!key) {
    console.warn(`RevenueCat: NEXT_PUBLIC_REVENUECAT_${platform.toUpperCase()}_KEY isn't set.`)
    return false
  }
  const Purchases = await sdk()
  if (!setup) {
    setup = (async () => {
      const { isConfigured } = await Purchases.isConfigured()
      if (!isConfigured) await Purchases.configure({ apiKey: key, appUserID: userId })
      else await Purchases.logIn({ appUserID: userId })
      currentUser = userId
    })()
    setup.catch(() => {
      setup = null
    })
  }
  await setup
  if (currentUser !== userId) {
    await Purchases.logIn({ appUserID: userId })
    currentUser = userId
  }
  return true
}

const DAYS: Record<string, number> = { DAY: 1, WEEK: 7, MONTH: 30, YEAR: 365 }

async function trialDays(product: PurchasesStoreProduct, platform: NativePlatform): Promise<number | null> {
  if (platform === "android") {
    // Google Play only offers the trial phase to people who are eligible.
    const free = product.defaultOption?.freePhase
    return free ? (DAYS[free.billingPeriod.unit] ?? 0) * free.billingPeriod.value || null : null
  }
  const intro = product.introPrice
  if (!intro || intro.price !== 0) return null
  const Purchases = await sdk()
  const eligibility = await Purchases.checkTrialOrIntroductoryPriceEligibility({ productIdentifiers: [product.identifier] })
  // 2 = INTRO_ELIGIBILITY_STATUS_ELIGIBLE. When unsure, don't promise a trial.
  if (eligibility[product.identifier]?.status !== 2) return null
  return (DAYS[intro.periodUnit] ?? 0) * intro.periodNumberOfUnits || null
}

async function toPlan(id: PlanId, pkg: PurchasesPackage | null, platform: NativePlatform): Promise<StorePlan | null> {
  if (!pkg) return null
  const product = pkg.product
  return {
    id,
    pkg,
    price: product.priceString,
    perMonth: id === "yearly" ? product.pricePerMonthString : null,
    trialDays: await trialDays(product, platform).catch(() => null),
    amount: product.price,
  }
}

/** The current offering's yearly and monthly packages, with store prices. */
export async function loadStorePlans(userId: string): Promise<StorePlans | null> {
  const platform = getNativePlatform()
  if (!platform || !(await setupPurchases(userId))) return null
  const Purchases = await sdk()
  const offerings = await Purchases.getOfferings()
  const offering: PurchasesOffering | null = offerings.current
  if (!offering) return null
  const [yearly, monthly] = await Promise.all([
    toPlan("yearly", offering.annual, platform),
    toPlan("monthly", offering.monthly, platform),
  ])
  return { ...(yearly ? { yearly } : {}), ...(monthly ? { monthly } : {}) }
}

export type PurchaseOutcome = "purchased" | "cancelled" | "pending"

/** Opens the App Store / Play Store sheet. Throws a short, showable Error on failure. */
export async function buyPlan(userId: string, plan: StorePlan): Promise<PurchaseOutcome> {
  await setupPurchases(userId)
  const Purchases = await sdk()
  try {
    const { customerInfo } = await Purchases.purchasePackage({ aPackage: plan.pkg })
    return customerInfo.entitlements.active[PRO_ENTITLEMENT_ID] ? "purchased" : "pending"
  } catch (error) {
    const code = (error as { code?: string } | null)?.code
    if (code === "1") return "cancelled" // PURCHASE_CANCELLED_ERROR
    if (code === "20") return "pending" // PAYMENT_PENDING_ERROR (e.g. Ask to Buy)
    throw new Error("The purchase didn't go through. You haven't been charged.")
  }
}

/** Restores earlier purchases on this Apple / Google account. True when Pro is active after. */
export async function restorePro(userId: string): Promise<boolean> {
  await setupPurchases(userId)
  const Purchases = await sdk()
  try {
    const { customerInfo } = await Purchases.restorePurchases()
    return Boolean(customerInfo.entitlements.active[PRO_ENTITLEMENT_ID])
  } catch {
    throw new Error("Couldn't reach the store to restore purchases. Try again in a moment.")
  }
}
