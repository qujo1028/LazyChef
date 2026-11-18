import { SectionTabs } from "@/components/section-tabs"

import type { ActivityView } from "../view"

const TABS = [
  { view: "log", href: "/activity", label: "Log" },
  { view: "chart", href: "/activity?view=chart", label: "Chart" },
  { view: "board", href: "/activity?view=board", label: "Board" },
] as const satisfies readonly { view: ActivityView; href: string; label: string }[]

export function ActivityTabs({ current }: { current: ActivityView }) {
  const href = TABS.find((tab) => tab.view === current)?.href ?? "/activity"
  return <SectionTabs label="Activity" tabs={TABS} current={href} />
}
