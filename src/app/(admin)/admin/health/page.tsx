import { Activity } from "lucide-react"

import { EmptyState } from "@/components/empty-state"
import { requireAdmin } from "@/features/admin/guard"

export default async function AdminHealthPage() {
  await requireAdmin()

  return (
    <EmptyState icon={Activity} title="Health coming soon">
      Deploy and service status will show up here.
    </EmptyState>
  )
}
