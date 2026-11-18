import { SectionTabs } from "@/components/section-tabs"

/** One screen, two views (?view=): the Log is the default and has no param. */
export const ACTIVITY_VIEWS = ["log", "stats"] as const
export type ActivityView = (typeof ACTIVITY_VIEWS)[number]

const TABS = [
  { view: "log", href: "/activity", label: "Log" },
  { view: "stats", href: "/activity?view=stats", label: "Stats" },
] as const

export function parseActivityView(value: string | string[] | undefined): ActivityView {
  const first = Array.isArray(value) ? value[0] : value
  return ACTIVITY_VIEWS.find((view) => view === first) ?? "log"
}

export function ActivityTabs({ current }: { current: ActivityView }) {
  const href = TABS.find((tab) => tab.view === current)?.href ?? "/activity"
  return <SectionTabs label="Activity" tabs={TABS} current={href} />
}
