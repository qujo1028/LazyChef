import { SectionTabs } from "@/components/section-tabs"

/** One screen, three views (?view=): Ideas is the default and has no param. */
export const RECIPE_VIEWS = ["ideas", "saved", "ours"] as const
export type RecipeView = (typeof RECIPE_VIEWS)[number]

const TABS = [
  { view: "ideas", href: "/recipes", label: "Ideas" },
  { view: "saved", href: "/recipes?view=saved", label: "Saved" },
  { view: "ours", href: "/recipes?view=ours", label: "Ours" },
] as const

export function parseRecipeView(value: string | string[] | undefined): RecipeView {
  const first = Array.isArray(value) ? value[0] : value
  return RECIPE_VIEWS.find((view) => view === first) ?? "ideas"
}

export function RecipesTabs({ current }: { current: RecipeView }) {
  const href = TABS.find((tab) => tab.view === current)?.href ?? "/recipes"
  return <SectionTabs label="Recipes" tabs={TABS} current={href} />
}
