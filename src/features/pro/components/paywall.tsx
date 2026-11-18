"use client"

import { Check, Crown, LoaderCircle, Smartphone } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { callAction } from "@/lib/call-action"
import { useNativePlatform } from "@/lib/native/platform"
import { cn } from "@/lib/utils"

import { refreshPro } from "../actions"
import { DEFAULT_SAVINGS, FEATURE_HEADLINES, PLANS, PRO_BENEFITS, yearlySavings, type PlanId, type ProFeature } from "@lazychef/core/pro/plans"
import { buyPlan, loadStorePlans, restorePro, type StorePlans } from "../purchases"
import type { ProStatus } from "@lazychef/core/pro/status"

/** Apple's standard terms of use (EULA), which App Store subscriptions can link to. */
const TERMS_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/"

type Shown = { price: string; per: string; perMonth: string | null; trialDays: number | null }

/**
 * The paywall: what Pro includes, Yearly (best deal, free trial) and Monthly, and the buy
 * button. Buying only works in the iOS/Android app; on the web it says so.
 */
export function Paywall({
  status,
  userId,
  feature,
  onDone,
  onMaybeLater,
}: {
  status: ProStatus
  userId: string
  /** The Pro feature that was tapped, for the headline. */
  feature?: ProFeature | null
  /** After a purchase or restore that turned Pro on. */
  onDone?: () => void
  /** Shows a "Maybe later" link (onboarding, sheets). */
  onMaybeLater?: () => void
}) {
  const router = useRouter()
  const platform = useNativePlatform()
  const [selected, setSelected] = useState<PlanId>("yearly")
  const [store, setStore] = useState<StorePlans | null>(null)
  const [storeProblem, setStoreProblem] = useState(false)
  const [busy, startBusy] = useTransition()

  useEffect(() => {
    if (!platform || status.householdPro) return
    let cancelled = false
    loadStorePlans(userId)
      .then((plans) => {
        if (cancelled) return
        if (plans && (plans.yearly || plans.monthly)) setStore(plans)
        else setStoreProblem(true)
      })
      .catch((error) => {
        console.error("Loading plans failed:", error)
        if (!cancelled) setStoreProblem(true)
      })
    return () => {
      cancelled = true
    }
  }, [platform, status.householdPro, userId])

  if (status.householdPro) return <AlreadyPro status={status} onDone={onDone} />

  const shown = (id: PlanId): Shown => {
    const fromStore = store?.[id]
    const plan = PLANS[id]
    return fromStore
      ? { price: fromStore.price, per: plan.per, perMonth: fromStore.perMonth, trialDays: fromStore.trialDays }
      : { price: plan.price, per: plan.per, perMonth: plan.perMonth, trialDays: plan.trialDays }
  }
  const savings = store?.yearly && store.monthly ? yearlySavings(store.yearly.amount, store.monthly.amount) : DEFAULT_SAVINGS
  const chosen = shown(selected)
  const canBuy = Boolean(platform && store?.[selected])

  async function unlock(message: string) {
    const result = await callAction(refreshPro)
    if ("error" in result) toast.success(message, { description: result.error })
    else toast.success(message)
    router.refresh()
    onDone?.()
  }

  function buy() {
    const plan = store?.[selected]
    if (!plan) return
    startBusy(async () => {
      try {
        const outcome = await buyPlan(userId, plan)
        if (outcome === "purchased") await unlock(plan.trialDays ? "Your free trial has started" : "Welcome to Pro")
        else if (outcome === "pending") toast("Your purchase is waiting for approval. Pro switches on once it's approved.")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "The purchase didn't go through.")
      }
    })
  }

  function restore() {
    startBusy(async () => {
      try {
        if (await restorePro(userId)) await unlock("Pro restored")
        else toast("No Pro subscription found on this account.")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Couldn't restore purchases.")
      }
    })
  }

  return (
    <div className="grid gap-5">
      <div className="grid justify-items-center gap-2 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
          <Crown className="size-7" aria-hidden />
        </div>
        <h2 className="text-2xl font-semibold tracking-tight text-balance">
          {feature ? FEATURE_HEADLINES[feature] : "Cook more, waste less with Pro"}
        </h2>
        <p className="text-sm text-muted-foreground">One subscription covers everyone in your household.</p>
      </div>

      <ul className="grid gap-2.5">
        {PRO_BENEFITS.map((benefit) => (
          <li key={benefit.title} className="flex gap-3">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Check className="size-3.5" aria-hidden />
            </span>
            <span className="text-sm leading-snug">
              <span className="font-medium">{benefit.title}</span>
              <span className="text-muted-foreground"> · {benefit.detail}</span>
            </span>
          </li>
        ))}
      </ul>

      <div role="radiogroup" aria-label="Choose a plan" className="grid gap-2.5">
        <PlanOption
          id="yearly"
          selected={selected === "yearly"}
          onSelect={setSelected}
          title="Yearly"
          badge={savings ? `Best deal · Save ${savings}%` : "Best deal"}
          shown={shown("yearly")}
        />
        <PlanOption id="monthly" selected={selected === "monthly"} onSelect={setSelected} title="Monthly" shown={shown("monthly")} />
      </div>

      {platform ? (
        <div className="grid gap-2">
          <Button type="button" size="lg" onClick={buy} disabled={!canBuy || busy}>
            {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
            {chosen.trialDays ? `Start ${chosen.trialDays}-day free trial` : `Subscribe for ${chosen.price}/${chosen.per}`}
          </Button>
          {storeProblem ? (
            <p className="text-center text-sm text-destructive" role="alert">
              Couldn&apos;t load prices from the {platform === "ios" ? "App Store" : "Play Store"}. Check your connection and
              try again.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="flex gap-3 rounded-xl border bg-muted/40 p-4 text-sm">
          <Smartphone className="size-5 shrink-0 text-primary" aria-hidden />
          <p>
            <span className="font-medium">Get Pro in the LazyChef app.</span> Subscriptions are bought through the App
            Store or Google Play, and Pro works here too once you have it.
          </p>
        </div>
      )}

      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        {chosen.trialDays
          ? `${chosen.trialDays} days free, then ${chosen.price} a ${chosen.per}. `
          : `${chosen.price} a ${chosen.per}. `}
        Renews automatically until you cancel. Cancel anytime in your{" "}
        {platform === "android" ? "Google Play" : platform === "ios" ? "App Store" : "App Store or Google Play"} settings, at
        least 24 hours before the{" "}
        {chosen.trialDays ? "trial ends" : "period ends"}.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
        {platform ? (
          <Button type="button" variant="link" className="h-11 px-1" onClick={restore} disabled={busy}>
            Restore purchases
          </Button>
        ) : null}
        <a href={TERMS_URL} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center px-1 text-muted-foreground underline-offset-4 hover:underline">
          Terms
        </a>
        <a href="/privacy" className="inline-flex h-11 items-center px-1 text-muted-foreground underline-offset-4 hover:underline">
          Privacy
        </a>
      </div>

      {onMaybeLater ? (
        <Button type="button" variant="ghost" onClick={onMaybeLater} disabled={busy}>
          Maybe later
        </Button>
      ) : null}
    </div>
  )
}

function PlanOption({
  id,
  selected,
  onSelect,
  title,
  badge,
  shown,
}: {
  id: PlanId
  selected: boolean
  onSelect: (id: PlanId) => void
  title: string
  badge?: string
  shown: Shown
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => onSelect(id)}
      className={cn(
        "relative grid min-h-16 grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border-2 p-4 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
      )}
    >
      {badge ? (
        <span className="absolute -top-2.5 left-4 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
          {badge}
        </span>
      ) : null}
      <span
        aria-hidden
        className={cn(
          "flex size-5 items-center justify-center rounded-full border-2",
          selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
        )}
      >
        {selected ? <Check className="size-3" /> : null}
      </span>
      <span className="grid gap-0.5">
        <span className="font-semibold">{title}</span>
        <span className="text-sm text-muted-foreground">
          {shown.trialDays ? `${shown.trialDays} days free, then ` : ""}
          {shown.price}/{shown.per}
        </span>
      </span>
      {shown.perMonth ? (
        <span className="text-right">
          <span className="block font-semibold">{shown.perMonth}</span>
          <span className="block text-xs text-muted-foreground">a month</span>
        </span>
      ) : null}
    </button>
  )
}

function AlreadyPro({ status, onDone }: { status: ProStatus; onDone?: () => void }) {
  return (
    <div className="grid justify-items-center gap-3 py-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
        <Crown className="size-7" aria-hidden />
      </div>
      <h2 className="text-2xl font-semibold tracking-tight">You have Pro</h2>
      <p className="text-sm text-muted-foreground">
        {status.mePro
          ? "Every Pro feature is on for you and your household."
          : `${status.sponsorName ?? "A housemate"}'s Pro covers everyone in this household.`}
      </p>
      {onDone ? (
        <Button type="button" onClick={onDone} className="mt-2 w-full">
          Done
        </Button>
      ) : null}
    </div>
  )
}
