import { LifeBuoy } from "lucide-react"

import { EmptyState } from "@/components/empty-state"
import { requireAdmin } from "@/features/admin/guard"

export default async function AdminSupportPage() {
  await requireAdmin()

  return (
    <EmptyState icon={LifeBuoy} title="Support coming soon">
      User lookup, Pro comps and the admin audit log will show up here.
    </EmptyState>
  )
}
