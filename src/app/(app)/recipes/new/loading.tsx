import { Skeleton } from "@/components/ui/skeleton"

export default function NewRecipeLoading() {
  return (
    <div className="grid gap-5" aria-busy="true" aria-label="Loading the recipe form">
      <Skeleton className="h-5 w-28" />
      <div className="grid gap-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      <Skeleton className="h-12 w-full rounded-lg" />
      <Skeleton className="h-32 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-12 rounded-lg" />
        <Skeleton className="h-12 rounded-lg" />
      </div>
      <Skeleton className="h-48 w-full rounded-lg" />
    </div>
  )
}
