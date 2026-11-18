import { Suspense } from "react"

import { AlertBanner } from "@/features/admin/components/alert-banner"
import { AdminSuspense } from "@/features/admin/components/admin-card"
import {
  ActivityCard,
  FunnelCard,
  HouseholdsCard,
  PopularCard,
  RetentionCard,
  RevenueCard,
  TrendsCard,
  UsageCard,
  UsersCard,
} from "@/features/admin/components/overview-cards"
import { requireAdmin } from "@/features/admin/guard"

export default async function AdminOverviewPage() {
  // Layouts and pages render in parallel, so each page checks too.
  await requireAdmin()

  return (
    <div className="grid gap-4">
      <Suspense fallback={null}>
        <AlertBanner />
      </Suspense>
      <div className="grid gap-4 lg:grid-cols-2">
        <AdminSuspense title="Users" rows={6}>
          <UsersCard />
        </AdminSuspense>
        <AdminSuspense title="Households" rows={4}>
          <HouseholdsCard />
        </AdminSuspense>
        <AdminSuspense title="Revenue and Pro" rows={8} className="lg:col-span-2">
          <RevenueCard className="lg:col-span-2" />
        </AdminSuspense>
        <AdminSuspense title="Usage totals" rows={8}>
          <UsageCard />
        </AdminSuspense>
        <AdminSuspense title="Activation funnel" rows={6}>
          <FunnelCard />
        </AdminSuspense>
        <AdminSuspense title="Activity, last 30 days" rows={5} className="lg:col-span-2">
          <ActivityCard className="lg:col-span-2" />
        </AdminSuspense>
        <AdminSuspense title="Trends" rows={6} className="lg:col-span-2">
          <TrendsCard className="lg:col-span-2" />
        </AdminSuspense>
        <AdminSuspense title="Retention" rows={6} className="lg:col-span-2">
          <RetentionCard />
        </AdminSuspense>
        <AdminSuspense title="Popular in the last 30 days" rows={6} className="lg:col-span-2">
          <PopularCard className="lg:col-span-2" />
        </AdminSuspense>
      </div>
    </div>
  )
}
