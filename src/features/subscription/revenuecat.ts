// Browser-only RevenueCat wrapper. Load it with `await import(...)` from client effects so the SDK
// stays out of the server render and the first-load bundle.
import {
  ErrorCode,
  LogLevel,
  Purchases,
  PurchasesError,
  type CustomerInfo,
  type EntitlementInfo,
} from "@revenuecat/purchases-js"

/** The entitlement that unlocks LazyChef Pro (RevenueCat dashboard → Product catalog → Entitlements). */
export const PRO_ENTITLEMENT_ID = "lazychef_pro"

export type { CustomerInfo, EntitlementInfo }

export function getApiKey(): string | null {
  return process.env.NEXT_PUBLIC_REVENUECAT_API_KEY?.trim() || null
}

/**
 * Returns the shared Purchases instance for this signed-in user. Configures it on first use and
 * switches users if someone else signs in on the same tab. The app user id is the Supabase user id,
 * so a subscription follows the person across devices (never use RevenueCat anonymous ids here:
 * Web Billing requires a stable id).
 */
export async function getPurchases(appUserId: string): Promise<Purchases> {
  if (Purchases.isConfigured()) {
    const purchases = Purchases.getSharedInstance()
    if (purchases.getAppUserId() !== appUserId) await purchases.changeUser(appUserId)
    return purchases
  }

  const apiKey = getApiKey()
  if (!apiKey) throw new PurchasesError(ErrorCode.ConfigurationError, "NEXT_PUBLIC_REVENUECAT_API_KEY is not set.")

  if (process.env.NODE_ENV !== "production") Purchases.setLogLevel(LogLevel.Debug)
  const purchases = Purchases.configure({ apiKey, appUserId })
  // Warm up branding so the paywall/checkout opens faster. Failure here is harmless.
  void purchases.preload().catch(() => {})
  return purchases
}

export function proEntitlement(info: CustomerInfo | null): EntitlementInfo | null {
  return info?.entitlements.active[PRO_ENTITLEMENT_ID] ?? null
}

export function isUserCancelled(error: unknown): boolean {
  return error instanceof PurchasesError && error.errorCode === ErrorCode.UserCancelledError
}

/** A short, user-facing message for a RevenueCat error. Details go to the console. */
export function describeError(error: unknown): string {
  if (!(error instanceof PurchasesError)) return "Something went wrong. Please try again."
  console.error("[RevenueCat]", error.errorCode, error.message, error.underlyingErrorMessage ?? "")

  switch (error.errorCode) {
    case ErrorCode.NetworkError:
      return "Couldn't reach the payment service. Check your connection and try again."
    case ErrorCode.ProductAlreadyPurchasedError:
      return "You already have LazyChef Pro."
    case ErrorCode.PaymentPendingError:
      return "Your payment is still processing. Pro will unlock as soon as it goes through."
    case ErrorCode.PurchaseNotAllowedError:
    case ErrorCode.PurchaseInvalidError:
      return "This purchase isn't allowed. Check your payment details and try again."
    case ErrorCode.ProductNotAvailableForPurchaseError:
      return "That plan isn't available right now."
    case ErrorCode.OperationAlreadyInProgressError:
      return "A purchase is already in progress."
    case ErrorCode.InvalidEmailError:
      return "That email address doesn't look right."
    case ErrorCode.ConfigurationError:
    case ErrorCode.InvalidCredentialsError:
      return "Subscriptions aren't set up yet."
    default:
      return "Something went wrong with the payment service. Please try again."
  }
}
