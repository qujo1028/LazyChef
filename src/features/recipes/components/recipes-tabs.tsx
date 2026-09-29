import { SectionTabs } from "@/components/section-tabs"

const TABS = [
  { href: "/recipes", label: "Ideas" },
  { href: "/recipes/saved", label: "Saved" },
] as const

export function RecipesTabs({ current }: { current: (typeof TABS)[number]["href"] }) {
  return <SectionTabs label="Recipes" tabs={TABS} current={current} />
}
