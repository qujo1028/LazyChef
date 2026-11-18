"use client"

/** Fired after a good moment (first pantry add) so the push pre-prompt may open. Does nothing in a browser. */
const OFFER_EVENT = "lazychef:offer-push"

export function offerPush() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OFFER_EVENT))
}

export function onOfferPush(listener: () => void) {
  window.addEventListener(OFFER_EVENT, listener)
  return () => window.removeEventListener(OFFER_EVENT, listener)
}

const ASKED_KEY = "lazychef.pushAsked"

/** The pre-prompt is shown once; after that the settings card is the way in. */
export function wasAsked(): boolean {
  try {
    return window.localStorage.getItem(ASKED_KEY) === "1"
  } catch {
    return true
  }
}

export function markAsked() {
  try {
    window.localStorage.setItem(ASKED_KEY, "1")
  } catch {
    // Without storage we'd ask every time, so wasAsked() says "asked" when storage fails.
  }
}
