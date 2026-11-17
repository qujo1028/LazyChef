"use client"

import Link from "next/link"

import { ALLERGIES, CUISINES, DIETS, labelOf } from "../options"
import { useFirstRunDraft } from "../use-draft"

/**
 * On sign-up, after the welcome flow: what will be saved with the new account
 * (Figma 08 "Saved with your account"). Nothing shows if they skipped everything.
 */
export function FirstRunSummary() {
  const [draft] = useFirstRunDraft()
  const { prefs, staples } = draft
  const rows = [
    prefs.diet !== "none" ? ["Diet", labelOf(DIETS, prefs.diet)] : null,
    prefs.allergies.length ? ["Avoid", prefs.allergies.map((a) => labelOf(ALLERGIES, a)).join(", ")] : null,
    prefs.cuisines.length ? ["Cuisines", prefs.cuisines.map((c) => labelOf(CUISINES, c)).join(", ")] : null,
    prefs.worldRecipes ? ["Recipes", "Include world recipes"] : null,
    staples.length ? ["Pantry", `${staples.length} ${staples.length === 1 ? "staple" : "staples"} to add`] : null,
  ].filter((row) => row !== null)
  if (rows.length === 0 || (draft.prefsSaved && staples.length === 0)) return null

  return (
    <section aria-labelledby="first-run-summary" className="grid gap-2.5 rounded-xl bg-card p-4 text-sm ring-1 ring-foreground/10">
      <div className="flex items-center justify-between">
        <h2 id="first-run-summary" className="font-medium">
          Saved with your account
        </h2>
        <Link
          href="/welcome?step=5"
          className="-my-2 inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline"
          aria-label="Edit your preferences"
        >
          Edit
        </Link>
      </div>
      <dl className="grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1.5">
        {rows.map(([term, value]) => (
          <div key={term} className="contents">
            <dt className="text-muted-foreground">{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
