import { SectionTabs } from "@/components/section-tabs"

const TABS = [
  { href: "/activity", label: "Feed" },
  { href: "/activity/stats", label: "Stats" },
] as const

export function ActivityTabs({ current }: { current: (typeof TABS)[number]["href"] }) {
  return <SectionTabs label="Activity" tabs={TABS} current={current} />
}
