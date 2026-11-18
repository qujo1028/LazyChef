import { AdminCard, CardNotice } from "@/features/admin/components/admin-card"
import { CohortHeatmap } from "@/features/admin/components/cohort-heatmap"
import { Funnel } from "@/features/admin/components/funnel"
import { PopularLists } from "@/features/admin/components/popular-lists"
import { StackedBars } from "@/features/admin/components/stacked-bars"
import { formatCount, formatPercent, formatUsd, StatGrid, StatTile } from "@/features/admin/components/stat-tile"
import { TrendChart } from "@/features/admin/components/trend-chart"
import { getActivationFunnel, getPopular, getRetentionCohorts } from "@/features/admin/insights"
import { loadSafely } from "@/features/admin/load"
import {
  captureSnapshotIfMissing,
  getActivityDaily,
  getDailySnapshots,
  getProStats,
  getRevenueMonthly,
  getRevenueStats,
  getSignupsDaily,
  getUsageStats,
  getUserStats,
} from "@/features/admin/overview"
import {
  activityMetric,
  addDays,
  counterSeriesFromStart,
  fillDays,
  findMetric,
  firstValueDay,
  formatByStore,
  lastDays,
  ratio,
  shortDay,
  shortMonth,
  stackActivity,
  utcDay,
} from "@/features/admin/overview-format"
import { getDailyCounters } from "@/features/admin/stats"

const asOf = () =>
  `As of ${new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC`
const today = () => utcDay(new Date())

function Failed({ title, kind, message, className }: { title: string; kind: "off" | "error"; message: string; className?: string }) {
  return (
    <AdminCard title={title} className={className}>
      <CardNotice kind={kind} message={message} />
    </AdminCard>
  )
}

export async function UsersCard() {
  const [stats, signups] = await Promise.all([loadSafely(getUserStats), loadSafely(() => getSignupsDaily(30))])
  if (!stats.ok) return <Failed title="Users" {...stats} />
  const s = stats.data
  const days = lastDays(today(), 30)
  return (
    <AdminCard title="Users" description={asOf()}>
      <div className="grid gap-4">
        <StatGrid className="lg:grid-cols-2">
          <StatTile label="Total users" value={formatCount(s.usersTotal)} />
          <StatTile label="New, 24 hours" value={formatCount(s.new24h)} />
          <StatTile label="New, 7 days" value={formatCount(s.new7d)} />
          <StatTile label="New, 30 days" value={formatCount(s.new30d)} />
          <StatTile label="Daily active" value={formatCount(s.dau)} hint="estimated: in-app activity + sign-ins" />
          <StatTile label="Weekly active" value={formatCount(s.wau)} hint="estimated: in-app activity + sign-ins" />
          <StatTile label="Monthly active" value={formatCount(s.mau)} hint="estimated: in-app activity + sign-ins" />
          <StatTile label="Stickiness (DAU ÷ MAU)" value={formatPercent(ratio(s.dau, s.mau))} hint="estimated: in-app activity + sign-ins" />
        </StatGrid>
        {signups.ok ? (
          <TrendChart
            title="New users per day, last 30 days"
            days={days}
            series={[{ name: "New users", values: fillDays(signups.data, days, (r) => r.users, 0), color: 0 }]}
          />
        ) : (
          <CardNotice kind={signups.kind} message={signups.message} />
        )}
      </div>
    </AdminCard>
  )
}

export async function HouseholdsCard() {
  const stats = await loadSafely(getUserStats)
  if (!stats.ok) return <Failed title="Households" {...stats} />
  const s = stats.data
  return (
    <AdminCard title="Households" description={asOf()}>
      <StatGrid className="lg:grid-cols-2">
        <StatTile label="Total households" value={formatCount(s.householdsTotal)} />
        <StatTile label="New, 7 days" value={formatCount(s.householdsNew7d)} />
        <StatTile label="New, 30 days" value={formatCount(s.householdsNew30d)} />
        <StatTile label="Average members" value={s.avgMembers.toFixed(1)} />
        <StatTile label="With 2+ members" value={formatPercent(s.multiMemberShare)} />
        <StatTile label="Never added a pantry item" value={formatCount(s.emptyHouseholds)} />
      </StatGrid>
    </AdminCard>
  )
}

export async function RevenueCard({ className }: { className?: string }) {
  const [revenue, pro, users, monthly] = await Promise.all([
    loadSafely(getRevenueStats),
    loadSafely(getProStats),
    loadSafely(getUserStats),
    loadSafely(() => getRevenueMonthly(12)),
  ])
  if (!revenue.ok) return <Failed title="Revenue and Pro" {...revenue} className={className} />
  const r = revenue.data
  const byStore = pro.ok ? formatByStore(pro.data.byStore) : null
  return (
    <AdminCard title="Revenue and Pro" description={asOf()} className={className}>
      <div className="grid gap-4">
        <section className="grid gap-2">
          <h3 className="text-sm font-medium">Money (US dollars)</h3>
          <StatGrid>
            <StatTile label="MRR (est.)" value={formatUsd(r.mrrEst)} />
            <StatTile label="Gross this month" value={formatUsd(r.grossMonth)} />
            <StatTile label="Gross, 30 days" value={formatUsd(r.gross30d)} />
            <StatTile label="Net, 30 days (est.)" value={formatUsd(r.net30dEst)} />
            <StatTile label="Refunds, 30 days" value={formatUsd(r.refunds30d)} />
            <StatTile label="Gross, all time" value={formatUsd(r.grossAllTime)} />
          </StatGrid>
        </section>
        <section className="grid gap-2">
          <h3 className="text-sm font-medium">Subscribers</h3>
          {pro.ok ? (
            <StatGrid>
              <StatTile label="Paying users" value={formatCount(r.payingUsers)} />
              <StatTile label="Active trials" value={formatCount(pro.data.trials)} />
              <StatTile label="Not renewing" value={formatCount(pro.data.notRenewing)} />
              <StatTile label="Comps" value={formatCount(pro.data.compsActive)} />
              <StatTile label="Pro households" value={formatCount(pro.data.proHouseholds)} />
            </StatGrid>
          ) : (
            <CardNotice kind={pro.kind} message={pro.message} />
          )}
          <p className="text-sm text-muted-foreground">{byStore ? `Paying people by store: ${byStore}` : "No paying people by store yet."}</p>
        </section>
        <section className="grid gap-2">
          <h3 className="text-sm font-medium">Conversion</h3>
          <StatGrid>
            {users.ok ? (
              <>
                <StatTile label="Paying ÷ users" value={formatPercent(ratio(r.payingUsers, users.data.usersTotal))} />
                <StatTile
                  label="Pro households ÷ households"
                  value={pro.ok ? formatPercent(ratio(pro.data.proHouseholds, users.data.householdsTotal)) : "–"}
                />
              </>
            ) : null}
            <StatTile label="Trials started, 30 days" value={formatCount(r.trialsStarted30d)} />
            <StatTile label="Expirations, 30 days" value={formatCount(r.expirations30d)} />
          </StatGrid>
        </section>
        {monthly.ok ? (
          <StackedBars
            title="Gross revenue per month, last 12 months"
            columns={monthly.data.map((m) => ({ label: shortMonth(m.month), segments: [{ key: "gross", value: m.gross }] }))}
            series={[{ key: "gross", label: "Gross revenue", color: 0 }]}
            format={(n) => formatUsd(Math.round(n * 100) / 100)}
          />
        ) : (
          <CardNotice kind={monthly.kind} message={monthly.message} />
        )}
        <p className="text-xs text-muted-foreground">
          From RevenueCat webhooks since they were set up. Production only; {formatCount(r.sandboxEvents30d)} sandbox events in the last 30
          days not counted. RevenueCat&apos;s dashboard is the source of truth.
        </p>
      </div>
    </AdminCard>
  )
}

const USAGE_ROWS: { label: string; metric: string }[] = [
  { label: "Pantry items now", metric: "pantry_items_now" },
  { label: "Pantry items added", metric: "pantry_items_added" },
  { label: "Cooked", metric: activityMetric("cooked") },
  { label: "Shopped", metric: activityMetric("shopped") },
  { label: "Used", metric: activityMetric("used") },
  { label: "Removed", metric: activityMetric("removed") },
  { label: "Shopping-list items", metric: "shopping_items" },
  { label: "Saved recipes", metric: "saved_recipes" },
  { label: "Ratings 👍", metric: "ratings_up" },
  { label: "Ratings 👎", metric: "ratings_down" },
  { label: "AI calls", metric: "ai_calls" },
  { label: "Spoonacular points", metric: "spoonacular_points" },
]

export async function UsageCard() {
  const usage = await loadSafely(getUsageStats)
  if (!usage.ok) return <Failed title="Usage totals" {...usage} />
  return (
    <AdminCard title="Usage totals" description={asOf()}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th scope="col" className="py-1 pr-3 font-normal">
                What
              </th>
              <th scope="col" className="px-2 py-1 text-right font-normal">
                All time
              </th>
              <th scope="col" className="px-2 py-1 text-right font-normal">
                30 d
              </th>
              <th scope="col" className="py-1 pl-2 text-right font-normal">
                7 d
              </th>
            </tr>
          </thead>
          <tbody>
            {USAGE_ROWS.map(({ label, metric }) => {
              const row = findMetric(usage.data, metric)
              return (
                <tr key={metric} className="border-t">
                  <th scope="row" className="whitespace-nowrap py-1.5 pr-3 text-left font-normal">
                    {label}
                  </th>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatCount(row?.allTime)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatCount(row?.d30)}</td>
                  <td className="py-1.5 pl-2 text-right tabular-nums">{formatCount(row?.d7)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </AdminCard>
  )
}

const ACTIVITY_ACTIONS = ["added", "used", "restocked", "cooked", "shopped", "removed", "updated"] as const

export async function ActivityCard({ className }: { className?: string }) {
  const rows = await loadSafely(() => getActivityDaily(30))
  if (!rows.ok) return <Failed title="Activity, last 30 days" {...rows} className={className} />
  const days = lastDays(today(), 30)
  const stacked = stackActivity(rows.data, days, ACTIVITY_ACTIONS)
  return (
    <AdminCard title="Activity, last 30 days" description={`Pantry and shopping actions per day. ${asOf()}`} className={className}>
      <StackedBars
        title="Actions per day"
        columns={stacked.map((c) => ({
          label: shortDay(c.day),
          segments: c.segments.map((s) => ({ key: s.key, value: s.n })),
        }))}
        series={ACTIVITY_ACTIONS.map((a, i) => ({ key: a, label: a[0].toUpperCase() + a.slice(1), color: i }))}
        format={formatCount}
      />
    </AdminCard>
  )
}

export async function TrendsCard({ className }: { className?: string }) {
  // Make sure today's snapshot exists before reading history.
  await captureSnapshotIfMissing()
  const end = today()
  const snapDays = lastDays(end, 90)
  const counterDays = lastDays(end, 30)
  const [snaps, counters] = await Promise.all([
    loadSafely(() => getDailySnapshots(addDays(end, -89), end)),
    loadSafely(() => getDailyCounters(addDays(end, -29), end)),
  ])
  const ai = counters.ok
    ? counterSeriesFromStart(counters.data, ["ai_allowance_free", "ai_allowance_pro", "ai_allowance_denied", "ai_calls"], counterDays)
    : null
  return (
    <AdminCard title="Trends" description={`Saved daily snapshots and event counters. ${asOf()}`} className={className}>
      <div className="grid gap-6 lg:grid-cols-2">
        {snaps.ok ? (
          <>
            <TrendChart
              title="Users and households, last 90 days"
              days={snapDays}
              series={[
                { name: "Users", values: fillDays(snaps.data, snapDays, (r) => r.usersTotal, null), color: 0 },
                { name: "Households", values: fillDays(snaps.data, snapDays, (r) => r.householdsTotal, null), color: 1 },
              ]}
              format={formatCount}
            />
            <ProTrend snaps={snaps.data} days={snapDays} />
          </>
        ) : (
          <div className="lg:col-span-2">
            <CardNotice kind={snaps.kind} message={snaps.message} />
          </div>
        )}
        <div className="lg:col-span-2">
          {ai ? (
            <TrendChart
              title="AI recipe calls per day, last 30 days"
              days={counterDays}
              series={[
                { name: "Free", values: ai.series.ai_allowance_free, color: 0 },
                { name: "Pro", values: ai.series.ai_allowance_pro, color: 2 },
                { name: "Turned away", values: ai.series.ai_allowance_denied, color: 4 },
                { name: "Total calls", values: ai.series.ai_calls, color: 6, dashed: true },
              ]}
              format={formatCount}
              note={ai.start ? `Tracking since ${shortDay(ai.start)}. Days with no events count as 0.` : "Tracking hasn't started yet."}
            />
          ) : !counters.ok ? (
            <CardNotice kind={counters.kind} message={counters.message} />
          ) : null}
        </div>
      </div>
    </AdminCard>
  )
}

function ProTrend({ snaps, days }: { snaps: Awaited<ReturnType<typeof getDailySnapshots>>; days: string[] }) {
  const pro = fillDays(snaps, days, (r) => r.proHouseholds, null)
  const mrr = fillDays(snaps, days, (r) => r.mrrEstUsd, null)
  const first = firstValueDay(days, pro) ?? firstValueDay(days, mrr)
  const note = first ? `Tracking since ${shortDay(first)}.` : "Tracking hasn't started yet."
  return (
    <div className="grid min-w-0 gap-6">
      <TrendChart
        title="Pro households over time"
        days={days}
        series={[{ name: "Pro households", values: pro, color: 3 }]}
        format={formatCount}
        note={note}
      />
      <TrendChart
        title="Estimated MRR over time"
        days={days}
        series={[{ name: "MRR (est.)", values: mrr, color: 2 }]}
        format={(n) => formatUsd(Math.round(n * 100) / 100)}
        note={note}
      />
    </div>
  )
}

export async function FunnelCard() {
  const steps = await loadSafely(() => getActivationFunnel(addDays(today(), -30)))
  if (!steps.ok) return <Failed title="Activation funnel" {...steps} />
  return (
    <AdminCard title="Activation funnel" description={asOf()}>
      <Funnel steps={steps.data} caption="Each step counted separately for people who signed up in the last 30 days." />
    </AdminCard>
  )
}

export async function RetentionCard() {
  const cohorts = await loadSafely(() => getRetentionCohorts(8))
  if (!cohorts.ok) return <Failed title="Retention" {...cohorts} />
  return (
    <AdminCard title="Retention" description={asOf()}>
      {cohorts.data.length ? <CohortHeatmap cohorts={cohorts.data} /> : <p className="text-sm text-muted-foreground">Nothing yet</p>}
    </AdminCard>
  )
}

export async function PopularCard({ className }: { className?: string }) {
  const popular = await loadSafely(() => getPopular(30, 10))
  if (!popular.ok) return <Failed title="Popular in the last 30 days" {...popular} className={className} />
  return (
    <AdminCard title="Popular in the last 30 days" description={asOf()} className={className}>
      <PopularLists popular={popular.data} />
    </AdminCard>
  )
}
