import { Skeleton } from "@/components/ui/skeleton"

export default function HouseholdLoading() {
  return (
    <div className="grid gap-6" aria-busy="true" aria-label="Loading your household">
      <div className="grid gap-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-24" />
      </div>
      {[3, 2, 1].map((rows, card) => (
        <div key={card} className="grid gap-3 rounded-xl border p-4">
          <Skeleton className="h-5 w-32" />
          {Array.from({ length: rows }, (_, row) => (
            <div key={row} className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-full" />
              <Skeleton className="h-4 w-40" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
