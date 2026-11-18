/** One screen, three views (?view=): the Log is the default and has no param. */
export const ACTIVITY_VIEWS = ["log", "chart", "board"] as const
export type ActivityView = (typeof ACTIVITY_VIEWS)[number]

/** Old name for the Chart (links, bookmarks and notifications from before the rename). */
const ALIASES: Record<string, ActivityView> = { stats: "chart" }

export function parseActivityView(value: string | string[] | undefined): ActivityView {
  const first = Array.isArray(value) ? value[0] : value
  if (first === undefined) return "log"
  return ACTIVITY_VIEWS.find((view) => view === first) ?? (Object.hasOwn(ALIASES, first) ? ALIASES[first] : "log")
}
