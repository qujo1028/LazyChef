import { Skeleton } from "@/components/ui/skeleton"

export default function OnboardingLoading() {
  return (
    <div className="mx-auto grid w-full max-w-md gap-6 px-4 pt-[calc(2.5rem+env(safe-area-inset-top))] pb-[calc(2.5rem+env(safe-area-inset-bottom))]" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-56" />
      {[0, 1].map((card) => (
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
