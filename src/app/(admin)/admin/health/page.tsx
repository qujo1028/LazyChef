import { AdminCard, AdminSuspense, CardNotice } from "@/features/admin/components/admin-card"
import { CiList } from "@/features/admin/components/ci-list"
import { DeployList, ProductionDeploy } from "@/features/admin/components/deploy-list"
import { EnvChecklist } from "@/features/admin/components/env-checklist"
import { ServiceList } from "@/features/admin/components/service-list"
import { requireAdmin } from "@/features/admin/guard"
import { loadSafely } from "@/features/admin/load"
import { latestProductionDeploy, listDeploys, mainCi } from "@/features/admin/github-deploys"
import { checkServices, envChecklist } from "@/features/admin/health"

async function ProductionDeployCard() {
  const result = await loadSafely(latestProductionDeploy)
  return (
    <AdminCard title="Production deploy">
      {!result.ok ? (
        <CardNotice kind={result.kind} message={result.message} />
      ) : result.data ? (
        <ProductionDeploy deploy={result.data} />
      ) : (
        <p className="text-sm text-muted-foreground">Nothing has been deployed to production yet.</p>
      )}
    </AdminCard>
  )
}

async function RecentDeploysCard() {
  const result = await loadSafely(() => listDeploys(10))
  return (
    <AdminCard title="Recent deploys">
      {result.ok ? <DeployList deploys={result.data} /> : <CardNotice kind={result.kind} message={result.message} />}
    </AdminCard>
  )
}

async function CiCard() {
  const result = await loadSafely(mainCi)
  return (
    <AdminCard title="CI on main">
      {result.ok ? (
        <CiList sha={result.data.sha} items={result.data.items} checksUnavailable={result.data.checksUnavailable} />
      ) : (
        <CardNotice kind={result.kind} message={result.message} />
      )}
    </AdminCard>
  )
}

async function ServicesCard() {
  const result = await loadSafely(checkServices)
  return (
    <AdminCard title="Services">
      {result.ok ? <ServiceList checks={result.data} /> : <CardNotice kind={result.kind} message={result.message} />}
    </AdminCard>
  )
}

export default async function AdminHealthPage() {
  await requireAdmin()

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <AdminSuspense title="Production deploy">
        <ProductionDeployCard />
      </AdminSuspense>
      <AdminSuspense title="Recent deploys">
        <RecentDeploysCard />
      </AdminSuspense>
      <AdminSuspense title="CI on main">
        <CiCard />
      </AdminSuspense>
      <AdminSuspense title="Services">
        <ServicesCard />
      </AdminSuspense>
      {/* RevenueCat events card: added by the data worker */}
      <AdminCard title="Environment">
        <EnvChecklist items={envChecklist()} />
      </AdminCard>
    </div>
  )
}
