import { AdminCard, AdminSuspense, CardNotice } from "@/features/admin/components/admin-card"
import { UsageBarChart } from "@/features/admin/components/usage-chart"
import { RateLimitTable, RejectedTable, TopHouseholdsTable } from "@/features/admin/components/limits-tables"
import { formatCount, formatPercent, StatGrid, StatTile } from "@/features/admin/components/stat-tile"
import { requireAdmin } from "@/features/admin/guard"
import { loadSafely } from "@/features/admin/load"
import { addDays, cacheHitRate, countersByMetric, errorsByCode, fillDays, sumMetric } from "@/features/admin/limits"
import {
  getAiTopHouseholds,
  getAiUsageStats,
  getDailyCounters,
  getRateLimitStats,
  getSpoonacularDaily,
  type DailyCounter,
} from "@/features/admin/stats"
import { DAILY_POINTS, utcDay } from "@/lib/spoonacular/cost"

// The Limits tab: API quotas, the AI allowance and where requests are being turned away.
// Each card loads its own data with loadSafely(), so one failing source only blanks its card.

/** The last 30 UTC days of Spoonacular usage, oldest first, with empty days filled in. */
async function loadSpoonacularDays() {
  return fillDays(await getSpoonacularDaily(30), 30, utcDay())
}

/** Daily counters for the last 14 UTC days, shared by the "Turned away" and "Errors" cards. */
async function loadCounters(): Promise<DailyCounter[]> {
  const today = utcDay()
  return getDailyCounters(addDays(today, -13), today)
}

async function SpoonacularTodayCard() {
  const result = await loadSafely(loadSpoonacularDays)
  return (
    <AdminCard title="Spoonacular today">
      {result.ok ? (
        <TodayStats today={result.data[result.data.length - 1]} />
      ) : (
        <CardNotice kind={result.kind} message={result.message} />
      )}
    </AdminCard>
  )
}

function TodayStats({
  today,
}: {
  today: { pointsUsed: number; pointsLeft: number | null; requests: number; estimated: boolean; exhaustedAt: string | null }
}) {
  const exhausted = today.exhaustedAt !== null
  const low = today.pointsLeft !== null && today.pointsLeft < 10
  return (
    <StatGrid>
      <StatTile
        label="Points used"
        value={`${today.pointsUsed} / ${DAILY_POINTS}`}
        hint={exhausted ? "Ran out today" : undefined}
        tone={exhausted ? "bad" : low ? "warn" : "default"}
      />
      <StatTile label="Points left" value={formatCount(today.pointsLeft)} />
      <StatTile label="Requests" value={formatCount(today.requests)} />
      <StatTile label="Source" value={today.estimated ? "Our estimate" : "Spoonacular"} />
    </StatGrid>
  )
}

async function SpoonacularChartCard({ className }: { className?: string }) {
  const result = await loadSafely(loadSpoonacularDays)
  return (
    <AdminCard
      title="Spoonacular, last 30 days"
      description="Points used each day. The limit is 50 a day. A red bar means the points ran out that day."
      className={className}
    >
      {result.ok ? (
        <UsageBarChart
          data={result.data.map((d) => ({ label: d.day, value: d.pointsUsed, flag: d.exhaustedAt !== null }))}
          limit={DAILY_POINTS}
          unit="points"
          title="Spoonacular points used per day, last 30 days"
        />
      ) : (
        <CardNotice kind={result.kind} message={result.message} />
      )}
    </AdminCard>
  )
}

async function AiAllowanceCard() {
  const result = await loadSafely(async () => {
    const [usage, top] = await Promise.all([getAiUsageStats(), getAiTopHouseholds(10)])
    return { usage, top }
  })
  return (
    <AdminCard
      title="AI allowance"
      description={
        result.ok
          ? `Free households get ${formatCount(result.data.usage.freeWeeklyLimit)} AI uses a week; Pro is unlimited.`
          : undefined
      }
    >
      {result.ok ? (
        <div className="grid gap-4">
          <StatGrid>
            <StatTile label="AI uses, 24 h" value={formatCount(result.data.usage.uses24h)} />
            <StatTile label="AI uses, 7 d" value={formatCount(result.data.usage.uses7d)} />
            <StatTile label="Households active, 7 d" value={formatCount(result.data.usage.householdsActive7d)} />
            <StatTile
              label="Households at cap"
              value={formatCount(result.data.usage.householdsAtLimit)}
              tone={result.data.usage.householdsAtLimit > 0 ? "warn" : "default"}
            />
          </StatGrid>
          <div className="grid gap-2">
            <h3 className="text-sm font-medium">Most AI use, last 7 days</h3>
            <TopHouseholdsTable rows={result.data.top} limit={result.data.usage.freeWeeklyLimit} />
          </div>
        </div>
      ) : (
        <CardNotice kind={result.kind} message={result.message} />
      )}
    </AdminCard>
  )
}

async function GroqCard() {
  const today = utcDay()
  const result = await loadSafely(async () => {
    const [counters, limits] = await Promise.all([getDailyCounters(addDays(today, -6), today), getRateLimitStats()])
    const aiCalls = countersByMetric(counters).get("ai_calls") ?? new Map<string, number>()
    return {
      callsToday: aiCalls.get(today) ?? 0,
      calls7d: sumMetric(counters, (metric) => metric === "ai_calls"),
      usersAtLimit: limits.find((row) => row.bucket === "ai")?.usersAtLimit ?? null,
    }
  })
  return (
    <AdminCard
      title="Groq (AI provider)"
      description="Free plan: 30 requests a minute and 14,400 a day, shared by everyone. Each server instance also stops itself at 30 a minute."
    >
      {result.ok ? (
        <StatGrid>
          <StatTile label="AI calls today" value={formatCount(result.data.callsToday)} />
          <StatTile label="AI calls, 7 d" value={formatCount(result.data.calls7d)} />
          <StatTile label="Users at AI limit now" value={formatCount(result.data.usersAtLimit)} />
        </StatGrid>
      ) : (
        <CardNotice kind={result.kind} message={result.message} />
      )}
    </AdminCard>
  )
}

async function HourlyLimitsCard({ className }: { className?: string }) {
  const result = await loadSafely(getRateLimitStats)
  return (
    <AdminCard
      title="Hourly limits"
      description="Per person. Hits (24 h) is a lower bound: old windows are cleared as people make new requests."
      className={className}
    >
      {result.ok ? <RateLimitTable rows={result.data} /> : <CardNotice kind={result.kind} message={result.message} />}
    </AdminCard>
  )
}

async function RejectedCard() {
  const result = await loadSafely(loadCounters)
  return (
    <AdminCard title="Turned away" description="Requests refused by a limit, per bucket.">
      {result.ok ? <RejectedTable rows={result.data} /> : <CardNotice kind={result.kind} message={result.message} />}
    </AdminCard>
  )
}

async function ErrorsCard() {
  const result = await loadSafely(loadCounters)
  return (
    <AdminCard title="Errors and cache" description="The last 14 days.">
      {result.ok ? (
        <div className="grid gap-4">
          <StatGrid>
            <StatTile label="Spoonacular cache hit rate" value={formatPercent(cacheHitRate(result.data))} />
            <StatTile
              label="AI errors, 14 d"
              value={formatCount(sumMetric(result.data, (m) => m.startsWith("ai_error:")))}
            />
            <StatTile
              label="Spoonacular errors, 14 d"
              value={formatCount(sumMetric(result.data, (m) => m.startsWith("spoonacular_error:")))}
            />
          </StatGrid>
          <div className="grid gap-4 sm:grid-cols-2">
            <CodeList title="AI errors by code" items={errorsByCode(result.data, "ai_error:")} />
            <CodeList title="Spoonacular errors by code" items={errorsByCode(result.data, "spoonacular_error:")} />
          </div>
        </div>
      ) : (
        <CardNotice kind={result.kind} message={result.message} />
      )}
    </AdminCard>
  )
}

function CodeList({ title, items }: { title: string; items: { code: string; total: number }[] }) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <h3 className="text-sm font-medium">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">None</p>
      ) : (
        <ul className="grid gap-1 text-sm">
          {items.map((item) => (
            <li key={item.code} className="flex min-w-0 justify-between gap-2">
              <span className="min-w-0 font-mono text-xs break-all">{item.code}</span>
              <span className="shrink-0 tabular-nums">{formatCount(item.total)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default async function AdminLimitsPage() {
  await requireAdmin()

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <AdminSuspense title="Spoonacular today">
        <SpoonacularTodayCard />
      </AdminSuspense>
      <AdminSuspense title="Spoonacular, last 30 days" className="lg:col-span-2">
        <SpoonacularChartCard className="lg:col-span-2" />
      </AdminSuspense>
      <AdminSuspense title="AI allowance">
        <AiAllowanceCard />
      </AdminSuspense>
      <AdminSuspense title="Groq (AI provider)">
        <GroqCard />
      </AdminSuspense>
      <AdminSuspense title="Hourly limits" className="lg:col-span-2">
        <HourlyLimitsCard className="lg:col-span-2" />
      </AdminSuspense>
      <AdminSuspense title="Turned away">
        <RejectedCard />
      </AdminSuspense>
      <AdminSuspense title="Errors and cache">
        <ErrorsCard />
      </AdminSuspense>
    </div>
  )
}
