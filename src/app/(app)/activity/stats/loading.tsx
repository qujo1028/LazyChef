import { Skeleton } from "@/components/ui/skeleton"

export default function StatsLoading() {
  return (
    <div className="grid gap-6" aria-busy="true" aria-label="Loading stats">
      <div className="grid gap-2">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-4 w-52" />
      </div>
      <Skeleton className="h-13 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-2.5">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </div>
  )
}
