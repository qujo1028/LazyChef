import { Skeleton } from "@/components/ui/skeleton"

export default function RecipeLoading() {
  return (
    <div className="grid gap-5" aria-busy="true" aria-label="Loading the recipe">
      <Skeleton className="h-5 w-24" />
      <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
      <div className="grid gap-2">
        <Skeleton className="h-7 w-4/5" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="divide-y rounded-xl border">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 px-3.5 py-3">
            <Skeleton className="size-5 rounded-full" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        ))}
      </div>
    </div>
  )
}
