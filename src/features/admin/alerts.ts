import "server-only"

import { z } from "zod"

import { checkServices } from "@/features/admin/health"
import { latestProductionDeploy } from "@/features/admin/github-deploys"
import { gh, GitHubError, githubConfig, type GitHubConfig } from "@/features/admin/github"
import { getRevenueCatRecent } from "@/features/admin/insights"
import { getRevenueStats } from "@/features/admin/overview"
import { getDailyCounters, getSpoonacularDaily } from "@/features/admin/stats"

// The daily check. The cron route calls runAlerts(), which gathers a few numbers, evaluates
// the alert rules and opens (or comments on) a GitHub issue labelled "alert" for each one.
// Nothing here throws out to the cron: each source fails on its own and runAlerts never throws.

export type Alert = { key: string; title: string; body: string }

export type AlertInputs = {
  today: string // UTC YYYY-MM-DD
  yesterday: string
  counters: { day: string; metric: string; n: number }[] // last 8 days through yesterday
  spoonacularYesterdayExhausted: boolean
  productionDeployState: string | null
  services: { name: string; state: "ok" | "warn" | "down" | "off"; detail: string }[]
  payingUsers: number
  lastWebhookAt: string | null
  now: Date
}

const DAY_MS = 24 * 60 * 60 * 1000
const WEBHOOK_STALE_MS = 14 * DAY_MS
const AI_SPIKE_MIN = 20
const AI_SPIKE_FACTOR = 3
const AI_SPIKE_BASELINE_DAYS = 7
const AI_ERROR_MIN = 10
const FOOTER = "Opened by the LazyChef admin cron. Close this issue when it's handled."

const LABEL = { name: "alert", color: "d73a4a", description: "Opened by the LazyChef admin cron" }

/** The hidden line at the end of every alert body that ties its issue to the alert key. */
export function alertMarker(key: string): string {
  return `<!-- alert-key: ${key} -->`
}

const openIssueSchema = z.object({
  number: z.number(),
  title: z.string(),
  body: z.string().nullish(),
  pull_request: z.unknown().optional(),
})

/** Open issues from the list endpoint, pull requests dropped, with their bodies. Bad rows are skipped. */
function openAlertIssues(data: unknown): { number: number; title: string; body: string }[] {
  if (!Array.isArray(data)) return []
  const out: { number: number; title: string; body: string }[] = []
  for (const item of data) {
    const parsed = openIssueSchema.safeParse(item)
    if (!parsed.success || parsed.data.pull_request !== undefined) continue
    out.push({ number: parsed.data.number, title: parsed.data.title, body: parsed.data.body ?? "" })
  }
  return out
}

/** The UTC calendar day of `date`, as YYYY-MM-DD. */
function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** `day` (YYYY-MM-DD) moved by `days` whole days. */
function shiftDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

/** Total of one metric on one day. Missing days and metrics count as 0. */
function countOn(counters: AlertInputs["counters"], day: string, metric: string): number {
  return counters.filter((c) => c.day === day && c.metric === metric).reduce((sum, c) => sum + c.n, 0)
}

/** Stale when there's been no webhook at all, or the newest is older than 14 days. */
function webhookIsStale(lastWebhookAt: string | null, now: Date): boolean {
  if (!lastWebhookAt) return true
  const received = Date.parse(lastWebhookAt)
  return !Number.isFinite(received) || now.getTime() - received > WEBHOOK_STALE_MS
}

/** Pure: the alerts that should be open for these inputs. Each rule gives at most one alert. */
export function evaluateAlerts(input: AlertInputs): Alert[] {
  const alerts: Alert[] = []
  const { today, yesterday } = input
  // Titles never carry dates or counts: GitHub matches on the title, so a stable title keeps
  // one open issue per alert. The numbers go in the body, and the hidden marker line lets
  // deliverAlerts find the issue even if the title is edited.
  const add = (key: string, title: string, lines: string[]) =>
    alerts.push({
      key,
      title,
      body: [...lines, "", `Checked ${today} (UTC).`, FOOTER, alertMarker(key)].join("\n"),
    })

  // 1. Spoonacular ran out of points yesterday.
  if (input.spoonacularYesterdayExhausted) {
    add("spoonacular-exhausted", "[alert] Spoonacular ran out of points", [
      `Spoonacular reported no points left on ${yesterday}. Recipe search and parsing stopped for the rest of that day.`,
    ])
  }

  // 2. The newest production deploy failed.
  if (input.productionDeployState === "failure" || input.productionDeployState === "error") {
    add("deploy-failed", "[alert] Latest production deploy failed", [
      `The newest Production deploy on GitHub has the state "${input.productionDeployState}".`,
    ])
  }

  // 3. Paying people, but no RevenueCat webhooks for 14+ days.
  if (input.payingUsers > 0 && webhookIsStale(input.lastWebhookAt, input.now)) {
    add("webhook-stale", "[alert] No RevenueCat webhooks for 14+ days", [
      `${input.payingUsers} paying ${input.payingUsers === 1 ? "person" : "people"}, but the last RevenueCat webhook was received ${input.lastWebhookAt ?? "never"}.`,
    ])
  }

  // 4 and 5. Yesterday's AI refusals or rate-limit hits spiked against the week before.
  const spike = (metric: string): { y: number; avg: number } | null => {
    const y = countOn(input.counters, yesterday, metric)
    let prior = 0
    for (let back = 1; back <= AI_SPIKE_BASELINE_DAYS; back++) {
      prior += countOn(input.counters, shiftDay(yesterday, -back), metric)
    }
    const avg = prior / AI_SPIKE_BASELINE_DAYS
    return y >= AI_SPIKE_MIN && y >= AI_SPIKE_FACTOR * avg ? { y, avg } : null
  }

  const refusals = spike("ai_allowance_denied")
  if (refusals) {
    add("ai-denials-spike", "[alert] AI allowance refusals spiked", [
      `${refusals.y} AI requests were refused for the weekly allowance on ${yesterday}.`,
      `The 7 days before averaged ${refusals.avg.toFixed(1)} a day.`,
    ])
  }

  const limited = spike("rate_limited:ai")
  if (limited) {
    add("ai-rate-limit-spike", "[alert] AI rate-limit hits spiked", [
      `${limited.y} AI requests hit the rate limit on ${yesterday}.`,
      `The 7 days before averaged ${limited.avg.toFixed(1)} a day.`,
    ])
  }

  // 6. Supabase or Groq is reported down.
  for (const service of input.services) {
    const watched = service.name.startsWith("Supabase") || service.name.startsWith("Groq")
    if (watched && service.state === "down") {
      add(`service-down:${service.name}`, `[alert] ${service.name} is down`, [
        `The health check for ${service.name} reported: ${service.detail}.`,
      ])
    }
  }

  // 7. Many AI errors yesterday.
  const errorCounters = input.counters.filter((c) => c.day === yesterday && c.metric.startsWith("ai_error:"))
  const errorTotal = errorCounters.reduce((sum, c) => sum + c.n, 0)
  if (errorTotal >= AI_ERROR_MIN) {
    const byCode = errorCounters
      .map((c) => ({ code: c.metric.slice("ai_error:".length), n: c.n }))
      .sort((a, b) => b.n - a.n)
    add("ai-errors", "[alert] AI errors spiked", [
      `AI requests failed ${errorTotal} times on ${yesterday}:`,
      ...byCode.map((row) => `- ${row.code}: ${row.n}`),
    ])
  }

  return alerts
}

/** Runs one read. A failure is logged and gives the neutral value, so it raises no alert. */
async function attempt<T>(what: string, neutral: T, read: () => Promise<T>): Promise<T> {
  try {
    return await read()
  } catch (error) {
    console.error(`[alerts] couldn't read ${what}:`, error)
    return neutral
  }
}

/** Reads everything the rules need. Each source fails on its own, to a value that raises no alert. */
export async function gatherAlertInputs(now = new Date()): Promise<AlertInputs> {
  const today = utcDay(now)
  const yesterday = shiftDay(today, -1)

  const [counters, spoonacularYesterdayExhausted, productionDeployState, services, payingUsers, lastWebhookAt] =
    await Promise.all([
      attempt("daily counters", [], () => getDailyCounters(shiftDay(yesterday, -AI_SPIKE_BASELINE_DAYS), yesterday)),
      attempt("Spoonacular usage", false, async () =>
        (await getSpoonacularDaily(3)).some((row) => row.day === yesterday && row.exhaustedAt !== null),
      ),
      attempt("the production deploy", null, async () => (await latestProductionDeploy())?.state ?? null),
      attempt("service checks", [], () => checkServices()),
      attempt("paying users", 0, async () => (await getRevenueStats()).payingUsers),
      // If this read fails, treat the webhook as just received so the stale rule stays quiet.
      attempt("the RevenueCat webhook log", now.toISOString(), async () => (await getRevenueCatRecent(1))[0]?.receivedAt ?? null),
    ])

  return {
    today,
    yesterday,
    counters,
    spoonacularYesterdayExhausted,
    productionDeployState,
    services,
    payingUsers,
    lastWebhookAt,
    now,
  }
}

/** Creates the "alert" label. A 422 means it already exists, which is fine. */
async function ensureAlertLabel(config: GitHubConfig): Promise<void> {
  try {
    await gh("/labels", { method: "POST", body: LABEL }, config)
  } catch (error) {
    if (error instanceof GitHubError && error.status === 422) return
    console.error("[alerts] couldn't create the alert label:", error)
  }
}

/**
 * Opens a GitHub issue for each alert, or comments on an open issue that has the same title or
 * the alert's marker line.
 * Returns zeros when GitHub isn't configured. Throws only if the open issues can't be listed,
 * since then duplicates can't be avoided. A failure on one alert doesn't stop the others.
 */
export async function deliverAlerts(alerts: Alert[]): Promise<{ opened: number; commented: number }> {
  const config = githubConfig()
  if (!config || alerts.length === 0) return { opened: 0, commented: 0 }

  await ensureAlertLabel(config)
  const openAlerts = openAlertIssues(
    await gh<unknown>("/issues?state=open&labels=alert&per_page=100", { revalidate: 0 }, config),
  )
  const today = utcDay(new Date())

  let opened = 0
  let commented = 0
  for (const alert of alerts) {
    try {
      // Same key (marker in the body) or same title counts as the same alert.
      const existing = openAlerts.find(
        (issue) => issue.title === alert.title || issue.body.includes(alertMarker(alert.key)),
      )
      if (existing) {
        await gh(
          `/issues/${existing.number}/comments`,
          { method: "POST", body: { body: `Still happening on ${today}.\n\n${alert.body}` } },
          config,
        )
        commented += 1
      } else {
        await gh("/issues", { method: "POST", body: { title: alert.title, body: alert.body, labels: ["alert"] } }, config)
        opened += 1
      }
    } catch (error) {
      console.error(`[alerts] couldn't deliver "${alert.key}":`, error)
    }
  }
  return { opened, commented }
}

/** Gather, evaluate, deliver. Never throws. */
export async function runAlerts(
  now = new Date(),
): Promise<{ alerts: string[]; opened: number; commented: number; skipped?: string }> {
  try {
    const alerts = evaluateAlerts(await gatherAlertInputs(now))
    const keys = alerts.map((alert) => alert.key)
    if (!githubConfig()) return { alerts: keys, opened: 0, commented: 0, skipped: "github not configured" }
    const { opened, commented } = await deliverAlerts(alerts)
    return { alerts: keys, opened, commented }
  } catch (error) {
    console.error("[alerts] the daily check failed:", error)
    return { alerts: [], opened: 0, commented: 0, skipped: "error" }
  }
}
