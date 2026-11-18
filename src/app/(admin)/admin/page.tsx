import { LayoutDashboard } from "lucide-react"

import { EmptyState } from "@/components/empty-state"
import { requireAdmin } from "@/features/admin/guard"

export default async function AdminOverviewPage() {
  // Layouts and pages render in parallel, so each page checks too.
  await requireAdmin()

  return (
    <EmptyState icon={LayoutDashboard} title="Overview coming soon">
      Users, revenue, usage and insights will show up here.
    </EmptyState>
  )
}
