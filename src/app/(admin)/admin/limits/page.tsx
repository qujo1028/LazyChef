import { Gauge } from "lucide-react"

import { EmptyState } from "@/components/empty-state"
import { requireAdmin } from "@/features/admin/guard"

export default async function AdminLimitsPage() {
  await requireAdmin()

  return (
    <EmptyState icon={Gauge} title="Limits coming soon">
      API quotas and AI allowance usage will show up here.
    </EmptyState>
  )
}
