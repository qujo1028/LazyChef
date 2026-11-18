// Pure: the household board. Weekly and all-time numbers are distinct cook days per member
// in the viewer's time zone (see cook-days.ts). Ties share a rank.
import { addDays, weekStart } from "@/features/activity/stats"
import { dayKey } from "@/features/activity/time"

import { cookDaysByActor, type CookRow } from "./cook-days"

export type BoardMember = { userId: string; displayName: string; avatarUrl: string | null }

export type BoardEntry = {
  userId: string
  name: string
  avatarUrl: string | null
  /** Cook days this week (Monday to today). */
  week: number
  /** Cook days in all the history we loaded. */
  allTime: number
  /** 1-based; equal counts share a rank (1, 1, 3). */
  weekRank: number
  allTimeRank: number
  /** Had the most cook days last week (at least one). Ties all win. */
  wonLastWeek: boolean
}

export type Leaderboard = {
  /** Monday of the week being counted. */
  weekStart: string
  /** Ordered for the Weekly view: this week, then all-time, then name. */
  weekly: BoardEntry[]
  /** Ordered for the All time view: all-time, then this week, then name. */
  allTime: BoardEntry[]
  lastWeekWinners: BoardEntry[]
}

function byName(a: { name: string }, b: { name: string }) {
  return a.name.localeCompare(b.name, "en", { sensitivity: "base" })
}

/** Standard competition ranking over a list already sorted best first. */
function assignRanks<T>(sorted: readonly T[], score: (item: T) => number): number[] {
  const ranks: number[] = []
  sorted.forEach((item, i) => {
    ranks.push(i > 0 && score(item) === score(sorted[i - 1]) ? ranks[i - 1] : i + 1)
  })
  return ranks
}

type Draft = Omit<BoardEntry, "weekRank" | "allTimeRank">

export function computeLeaderboard(
  rows: readonly CookRow[],
  members: readonly BoardMember[],
  now: number,
  timeZone?: string,
): Leaderboard {
  const today = dayKey(now, timeZone)
  const thisWeek = weekStart(today)
  const lastWeek = addDays(thisWeek, -7)
  const nextWeek = addDays(thisWeek, 7)
  const days = cookDaysByActor(rows, timeZone)

  const base = members.map((member) => {
    const mine = days.get(member.userId) ?? new Set<string>()
    let week = 0
    let previous = 0
    for (const day of mine) {
      if (day >= thisWeek && day < nextWeek) week += 1
      else if (day >= lastWeek && day < thisWeek) previous += 1
    }
    return { member, week, previous, allTime: mine.size }
  })

  const topLastWeek = Math.max(0, ...base.map((entry) => entry.previous))
  const winners = new Set(
    topLastWeek > 0 ? base.filter((entry) => entry.previous === topLastWeek).map((entry) => entry.member.userId) : [],
  )

  const drafts: Draft[] = base.map(({ member, week, allTime }) => ({
    userId: member.userId,
    name: member.displayName,
    avatarUrl: member.avatarUrl,
    week,
    allTime,
    wonLastWeek: winners.has(member.userId),
  }))

  const weekly = [...drafts].sort((a, b) => b.week - a.week || b.allTime - a.allTime || byName(a, b))
  const allTime = [...drafts].sort((a, b) => b.allTime - a.allTime || b.week - a.week || byName(a, b))
  const weekRanks = assignRanks(weekly, (e) => e.week)
  const allTimeRanks = assignRanks(allTime, (e) => e.allTime)
  const weekRankOf = new Map(weekly.map((e, i) => [e.userId, weekRanks[i]]))
  const allTimeRankOf = new Map(allTime.map((e, i) => [e.userId, allTimeRanks[i]]))

  const full = (e: Draft): BoardEntry => ({
    ...e,
    weekRank: weekRankOf.get(e.userId) ?? 1,
    allTimeRank: allTimeRankOf.get(e.userId) ?? 1,
  })
  const weeklyEntries = weekly.map(full)
  return {
    weekStart: thisWeek,
    weekly: weeklyEntries,
    allTime: allTime.map(full),
    lastWeekWinners: weeklyEntries.filter((e) => e.wonLastWeek),
  }
}
