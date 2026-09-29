import { Skeleton } from "@/components/ui/skeleton"

export default function JoinLoading() {
  return (
    <div className="mx-auto grid w-full max-w-md gap-6 px-4 py-10" aria-busy="true" aria-label="Loading the invite">
      <Skeleton className="h-8 w-56" />
      {[0].map((card) => (
        <div key={card} className="grid gap-3 rounded-xl border p-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      ))}
    </div>
  )
}
